import {createHash,randomUUID} from 'node:crypto';
export const TRIAL_SECONDS=600;
export function defaultPlanId(tenant){
 const h=createHash('sha256').update('default-two-minute-plan:'+tenant).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function trialRefund(reserved,seconds,failed=false){
 if(!Number.isInteger(reserved)||reserved<1||reserved>3600||!Number.isFinite(seconds)||seconds<0)throw Error('Invalid trial settlement');
 return reserved-(failed?0:Math.min(reserved,Math.max(1,Math.ceil(seconds))));
}
export function validateCallingPlan(b){
 if(!b||typeof b.name!=='string'||!b.name.trim()||b.name.length>100||typeof b.description!=='string'||b.description.length>1000||typeof b.active!=='boolean'||!Number.isInteger(b.minutes)||b.minutes<1||b.minutes>60)throw Error('Name, description, active status and whole minutes from 1 to 60 required');
 return {...b,name:b.name.trim(),seconds:b.minutes*60};
}
export async function topUpTrialGrants(db,tenant,seconds){
 // Credit only the increase in the lifetime grant. Reservations remain deducted.
 await db.query('UPDATE calling_trial_balances SET remaining_seconds=remaining_seconds+GREATEST($1-granted_seconds,0),granted_seconds=GREATEST(granted_seconds,$1) WHERE tenant_id=$2',[seconds,tenant]);
}
export async function ensureDefaultCallingPlan(db,userId){
 const u=(await db.query("SELECT tenant_id FROM users WHERE id=$1 AND status='active'",[userId])).rows[0];
 if(!u)return;
 const id=defaultPlanId(u.tenant_id);
 await db.query('INSERT IGNORE INTO calling_plan_settings(tenant_id,allowance_seconds) VALUES($1,600)',[u.tenant_id]);
 const setting=(await db.query('SELECT allowance_seconds FROM calling_plan_settings WHERE tenant_id=$1',[u.tenant_id])).rows[0];
 const seconds=Number(setting.allowance_seconds);
 await db.query("INSERT IGNORE INTO plans(id,tenant_id,name,description,monthly_cents,active) VALUES($1,$2,'Starter — 10 free minutes','One-time 600-second outbound calling allowance. Carrier and caller ID requirements apply.',0,TRUE)",[id,u.tenant_id]);
 await db.query("INSERT IGNORE INTO subscriptions(user_id,plan_id,status) VALUES($1,$2,'active')",[userId,id]);
 await db.query('INSERT IGNORE INTO calling_trial_balances(user_id,tenant_id,remaining_seconds,granted_seconds) VALUES($1,$2,$3,$3)',[userId,u.tenant_id,seconds]);
}
export async function migrateDefaultCallingPlan(db){
 await db.query(`CREATE TABLE IF NOT EXISTS calling_trial_balances (
 user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,remaining_seconds INT UNSIGNED NOT NULL DEFAULT 600,
 granted_seconds INT UNSIGNED NOT NULL DEFAULT 600,
 FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
 const col=await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='calling_trial_balances' AND column_name='granted_seconds'");
 if(!col.rowCount)await db.query('ALTER TABLE calling_trial_balances ADD COLUMN granted_seconds INT UNSIGNED NOT NULL DEFAULT 120');
 const checks=await db.query(`SELECT tc.CONSTRAINT_NAME AS name,cc.CHECK_CLAUSE AS clause_text FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME='calling_trial_balances' AND tc.CONSTRAINT_TYPE='CHECK'`);
 for(const c of checks.rows){
  if(/remaining_seconds/i.test(c.clause_text)&&/120/.test(c.clause_text)){
   if(!/^[a-z0-9_]+$/i.test(c.name))throw Error('Unexpected legacy constraint name');
   await db.query('ALTER TABLE calling_trial_balances DROP CHECK `'+c.name+'`');
  }
 }
 await db.query(`CREATE TABLE IF NOT EXISTS calling_plan_settings(tenant_id CHAR(36) PRIMARY KEY,allowance_seconds INT UNSIGNED NOT NULL DEFAULT 600,revision INT UNSIGNED NOT NULL DEFAULT 1,FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
 const users=(await db.query("SELECT u.id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.status='active' AND t.status='active'")).rows;
 for(const u of users)await ensureDefaultCallingPlan(db,u.id);
 const settings=(await db.query('SELECT tenant_id,allowance_seconds FROM calling_plan_settings')).rows;
 for(const c of settings){
  await topUpTrialGrants(db,c.tenant_id,Number(c.allowance_seconds));
  await db.query("UPDATE plans SET name='Starter — 10 free minutes',description='One-time 600-second outbound calling allowance. Carrier and caller ID requirements apply.' WHERE id=$1 AND tenant_id=$2 AND name='Starter — 2 free minutes'",[defaultPlanId(c.tenant_id),c.tenant_id]);
 }
}
export async function handleCallingPlan({req,res,path,user,pool,send,readJson}){
 if(path!=='/api/admin/calling-plan')return false;
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const id=defaultPlanId(user.tenant_id);
 if(req.method==='GET'){
  const p=(await pool.query('SELECT p.id,p.name,p.description,p.active,p.monthly_cents,c.allowance_seconds,c.revision FROM plans p JOIN calling_plan_settings c ON c.tenant_id=p.tenant_id WHERE p.id=$1 AND p.tenant_id=$2',[id,user.tenant_id])).rows[0];
  return send(res,200,{plan:p?{...p,active:!!Number(p.active),minutes:Number(p.allowance_seconds)/60}:null});
 }
 if(req.method!=='PUT')return send(res,405,{error:'Method not allowed'});
 let b;try{b=validateCallingPlan(await readJson(req));if(!Number.isInteger(b.expectedRevision))throw Error('Refresh plan before saving');}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();
 try{
  await db.query('START TRANSACTION');
  const old=(await db.query('SELECT revision FROM calling_plan_settings WHERE tenant_id=$1 FOR UPDATE',[user.tenant_id])).rows[0];
  if(!old||Number(old.revision)!==b.expectedRevision){await db.query('ROLLBACK');return send(res,409,{error:'Plan changed; refresh before saving'});}
  await db.query('UPDATE plans SET name=$1,description=$2,active=$3 WHERE id=$4 AND tenant_id=$5',[b.name,b.description,b.active,id,user.tenant_id]);
  await db.query('UPDATE calling_plan_settings SET allowance_seconds=$1,revision=revision+1 WHERE tenant_id=$2',[b.seconds,user.tenant_id]);
  await topUpTrialGrants(db,user.tenant_id,b.seconds);
  await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'default_calling_plan_updated')",[randomUUID(),user.tenant_id,user.id,id]);
  await db.query('COMMIT');return send(res,200,{saved:true});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
