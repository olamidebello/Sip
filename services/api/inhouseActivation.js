import {randomUUID} from 'node:crypto';
export const activationDefaults={allocationEnabled:true,firstCallRequired:true,cooldownDays:30,retentionDays:30,minimumSeconds:60,holdDays:7,codeMinutes:10,codeDailyLimit:5,verificationTo:'+12109050290',version:0};
export function validateActivation(p){
 if(!p||typeof p.allocationEnabled!=='boolean'||typeof p.firstCallRequired!=='boolean'||!Number.isInteger(p.version)||p.version<0||!/^\+[1-9][0-9]{7,14}$/.test(p.verificationTo||''))throw Error('Valid activation controls required');
 for(const [k,min,max] of [['cooldownDays',1,365],['retentionDays',7,365],['minimumSeconds',1,3600],['holdDays',1,30],['codeMinutes',1,30],['codeDailyLimit',1,20]])if(!Number.isInteger(p[k])||p[k]<min||p[k]>max)throw Error('Invalid '+k);
 return Object.fromEntries(Object.keys(activationDefaults).map(k=>[k,p[k]]));
}
export async function migrateInhouseActivation(db){
 await db.query(`CREATE TABLE IF NOT EXISTS inhouse_admin_actions(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,action VARCHAR(32) NOT NULL,details JSON NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX inhouse_admin_tenant(tenant_id,created_at)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS inhouse_activation_policies(tenant_id CHAR(36) PRIMARY KEY,policy JSON NOT NULL,version INT NOT NULL,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS inhouse_activation_history(id CHAR(36) PRIMARY KEY,nigeria_number VARCHAR(16) NOT NULL,did_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,allocated_at DATETIME(3) NOT NULL,blocked_until DATETIME(3) NOT NULL,UNIQUE KEY activation_once(nigeria_number,did_id,allocated_at),INDEX nigeria_cooldown(nigeria_number,blocked_until)) ENGINE=InnoDB`);
 for(const [table,name,ddl] of [['inhouse_subscriber_assignments','state',"VARCHAR(16) NOT NULL DEFAULT 'active'"],['inhouse_subscriber_assignments','provisioned_at','DATETIME(3) NULL'],['inhouse_sms_challenges','recipient_e164',"VARCHAR(16) NOT NULL DEFAULT '+12109050290'"]]){
  const found=await db.query('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=$1 AND column_name=$2',[table,name]);if(!found.rows.length)await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
 }
 await db.query("UPDATE inhouse_subscriber_assignments SET provisioned_at=created_at WHERE state='active' AND provisioned_at IS NULL");
 // Seed prior verified allocations so changing accounts cannot reset the window.
 await db.query("INSERT IGNORE INTO inhouse_activation_history(id,nigeria_number,did_id,user_id,tenant_id,allocated_at,blocked_until) SELECT UUID(),v.number_e164,f.did_id,f.user_id,f.tenant_id,f.created_at,DATE_ADD(f.created_at,INTERVAL 30 DAY) FROM inhouse_subscriber_assignments f JOIN inhouse_nigeria_verifications v ON v.user_id=f.user_id AND v.tenant_id=f.tenant_id WHERE NOT EXISTS(SELECT 1 FROM inhouse_activation_history h WHERE h.did_id=f.did_id AND h.user_id=f.user_id)");
}
export async function activationPolicy(db,tenant){const r=(await db.query('SELECT policy,version FROM inhouse_activation_policies WHERE tenant_id=$1',[tenant])).rows[0];return r?{...activationDefaults,...(typeof r.policy==='string'?JSON.parse(r.policy):r.policy),version:Number(r.version)}:{...activationDefaults};}
export async function reserveActivation(db,user,did,policy){
 // The verification row is the global per-Nigeria-number mutex across tenants.
 const v=(await db.query('SELECT number_e164 FROM inhouse_nigeria_verifications WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[user.id,user.tenant_id])).rows[0];if(!v)throw Error('Verify your Nigeria number before allocation');
 const prior=(await db.query('SELECT blocked_until FROM inhouse_activation_history WHERE nigeria_number=$1 AND blocked_until>UTC_TIMESTAMP(3) ORDER BY blocked_until DESC LIMIT 1 FOR UPDATE',[v.number_e164])).rows[0];if(prior)throw Error('This Nigeria number has already activated an in-house DID within the allocation window');
 await db.query('INSERT INTO inhouse_activation_history(id,nigeria_number,did_id,user_id,tenant_id,allocated_at,blocked_until) VALUES($1,$2,$3,$4,$5,UTC_TIMESTAMP(3),$6)',[randomUUID(),v.number_e164,did.id,user.id,user.tenant_id,new Date(Date.now()+policy.cooldownDays*86400000)]);
 return policy.firstCallRequired?'pending':'active';
}
export async function assertFirstCallDestination(db,actor,destination){
 const p=(await db.query("SELECT v.number_e164 FROM inhouse_subscriber_assignments f JOIN inhouse_nigeria_verifications v ON v.user_id=f.user_id AND v.tenant_id=f.tenant_id WHERE f.user_id=$1 AND f.tenant_id=$2 AND f.state='pending' LIMIT 1",[actor.user_id,actor.tenant_id])).rows[0];
 if(p&&destination!==p.number_e164.replace(/^\+/,''))throw Error('Complete your first call to '+p.number_e164+' before other paid calls');
}
export async function completeInhouseFirstCall(db,key){
 // Only the durable, settled answered-call record can complete provisioning.
 await db.query("UPDATE inhouse_subscriber_assignments f JOIN inhouse_dids d ON d.id=f.did_id AND d.user_id=f.user_id AND d.tenant_id=f.tenant_id JOIN inhouse_nigeria_verifications v ON v.user_id=f.user_id AND v.tenant_id=f.tenant_id JOIN pstn_calls c ON c.user_id=f.user_id AND c.tenant_id=f.tenant_id AND c.caller_id=d.number_e164 AND c.destination=TRIM(LEADING '+' FROM v.number_e164) SET f.state='active',f.provisioned_at=FROM_UNIXTIME(c.ended_epoch) WHERE f.state='pending' AND c.call_key=$1 AND c.status='settled' AND c.answered_epoch IS NOT NULL AND c.ended_epoch-c.answered_epoch>=1 AND FROM_UNIXTIME(c.answered_epoch)>=f.created_at",[key]);
}
export async function handleInhouseActivationAdmin({req,res,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'){try{return send(res,200,await manageInhouseInventory(pool,user,await readJson(req)));}catch(e){return send(res,409,{error:e.code?'Inventory operation unavailable':e.message});}}
 if(req.method==='GET')return send(res,200,{inventory:(await pool.query('SELECT d.id,d.number_e164,d.status,d.user_id,h.available_at FROM inhouse_dids d LEFT JOIN inhouse_release_holds h ON h.did_id=d.id WHERE d.tenant_id=$1 AND d.number_e164 LIKE $2 ORDER BY d.number_e164 LIMIT 1000',[user.tenant_id,'%'+String(new URL(req.url||'/', 'http://localhost').searchParams.get('number')||'').replace(/[^+0-9]/g,'').slice(0,16)+'%'])).rows,users:(await pool.query("SELECT id,display_name FROM users WHERE tenant_id=$1 AND status='active' ORDER BY display_name LIMIT 1000",[user.tenant_id])).rows,policy:await activationPolicy(pool,user.tenant_id),assignments:(await pool.query('SELECT d.number_e164,f.user_id,f.state,f.created_at,f.provisioned_at,f.qualified_at FROM inhouse_subscriber_assignments f JOIN inhouse_dids d ON d.id=f.did_id AND d.tenant_id=f.tenant_id AND d.user_id=f.user_id WHERE f.tenant_id=$1 ORDER BY f.created_at DESC LIMIT 500',[user.tenant_id])).rows});
 if(req.method!=='PUT')return send(res,405,{error:'GET, POST or PUT required'});
 let policy;try{policy=validateActivation(await readJson(req));}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);const old=await activationPolicy(db,user.tenant_id);if(old.version!==policy.version)throw Error('Policy changed; reload before saving');const version=old.version+1;
 await db.query('INSERT INTO inhouse_activation_policies(tenant_id,policy,version,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE policy=VALUES(policy),version=VALUES(version),updated_by=VALUES(updated_by)',[user.tenant_id,JSON.stringify(policy),version,user.id]);await db.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),user.tenant_id,user.id,'inhouse_activation_policy_updated']);await db.query('COMMIT');return send(res,200,{saved:true,version});
 }catch(e){await db.query('ROLLBACK');return send(res,409,{error:e.code?'Policy update unavailable':e.message});}finally{db.release();}
}

export function validateInventoryAction(b){
 if(!b||!['provision','assign','disable','enable'].includes(b.action)||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>255)throw Error('Action and audit reason required');
 if(b.action==='provision'){
  if(!/^\+23420315[0-4][0-9]{4}$/.test(b.number||'')||!Number.isInteger(b.count)||b.count<1||b.count>1000)throw Error('Choose a licensed in-house number and a batch of 1–1000');
  if(Number(b.number.slice(-4))+b.count>10000)throw Error('Batch must stay within one licensed block');
 }else if(!/^[a-f0-9-]{36}$/i.test(b.didId||''))throw Error('DID selection required');
 if(b.action==='assign'&&!/^[a-f0-9-]{36}$/i.test(b.userId||''))throw Error('Subscriber selection required');
 return b;
}
export async function manageInhouseInventory(pool,user,input){
 const b=validateInventoryAction(input),db=await pool.connect();
 try{
  await db.query('START TRANSACTION');
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);
  const policy=await activationPolicy(db,user.tenant_id);let result;
  if(b.action==='provision'){
   const prefix=b.number.slice(4,10);
   const entitlement=(await db.query("SELECT tenant_id FROM did_requested_blocks WHERE tenant_id=$1 AND prefix_digits=$2 AND status='allocated_ncc' FOR UPDATE",[user.tenant_id,prefix])).rows[0];
   if(!entitlement)throw Error('Selected workspace has no licensed block entitlement');
   let group=(await db.query('SELECT id,tenant_id FROM smooth_did_groups WHERE prefix_digits=$1 FOR UPDATE',[prefix])).rows[0];
   if(group&&group.tenant_id!==user.tenant_id)throw Error('Block belongs to another workspace');
   if(!group){group={id:randomUUID()};await db.query('INSERT INTO smooth_did_groups(id,tenant_id,prefix_digits,policy,updated_by) VALUES($1,$2,$3,$4,$5)',[group.id,user.tenant_id,prefix,JSON.stringify({name:'SmoothDID '+prefix,monthlyCents:0,enabled:false,geofenceEnabled:false,zones:[],allowedGroupIds:[],maxAccuracyMeters:1000,maxAgeSeconds:45,voiceReady:false,smsReady:false,routingReference:'',interconnects:['icn']}),user.id]);}
   let added=0;
   for(let i=0;i<b.count;i++){
    const number='+'+String(Number(b.number.slice(1))+i),existing=(await db.query('SELECT id,tenant_id FROM inhouse_dids WHERE number_e164=$1 FOR UPDATE',[number])).rows[0];
    if(existing){if(existing.tenant_id!==user.tenant_id)throw Error('Number belongs to another workspace');continue;}
    const id=randomUUID();await db.query("INSERT INTO inhouse_dids(id,tenant_id,number_e164,price_mode,setup_cents,monthly_cents,status,evidence_reference) VALUES($1,$2,$3,'manual',0,0,'available',$4)",[id,user.tenant_id,number,b.reason.trim()]);
    await db.query('INSERT INTO smooth_did_members(did_id,group_id) VALUES($1,$2)',[id,group.id]);added++;
   }
   result={provisioned:added,existing:b.count-added};
  }else{
   // User lock order matches automatic allocation, before the DID row.
   if(b.action==='assign'){
    const u=(await db.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active' FOR UPDATE",[b.userId,user.tenant_id])).rows[0];if(!u)throw Error('Active subscriber in selected workspace required');
    const plan=(await db.query("SELECT 1 FROM subscriptions s JOIN plans p ON p.id=s.plan_id AND p.tenant_id=$2 WHERE s.user_id=$1 AND s.status='active' AND p.active=TRUE LIMIT 1",[b.userId,user.tenant_id])).rows[0];if(!plan)throw Error('Active subscription required');
    const prior=(await db.query('SELECT did_id FROM inhouse_subscriber_assignments WHERE user_id=$1 AND tenant_id=$2 LIMIT 1',[b.userId,user.tenant_id])).rows[0];if(prior)throw Error('Subscriber already has an in-house DID');
    if(!policy.allocationEnabled)throw Error('New allocations are paused');
   }
   const did=(await db.query('SELECT id,number_e164,status,user_id FROM inhouse_dids WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[b.didId,user.tenant_id])).rows[0];
   if(!did||!/^\+23420315[0-4][0-9]{4}$/.test(did.number_e164))throw Error('In-house DID in selected workspace required');
   if(did.user_id||!['available','disabled'].includes(did.status))throw Error('Assigned or reserved DID cannot be changed here');
   const hold=(await db.query('SELECT did_id FROM inhouse_release_holds WHERE did_id=$1 FOR UPDATE',[did.id])).rows[0];if(hold)throw Error('DID is quarantined; wait for the lifecycle worker');
   if(b.action==='assign'){
    if(did.status!=='available')throw Error('Enable this DID before assignment');
    const state=await reserveActivation(db,{id:b.userId,tenant_id:user.tenant_id},did,policy);
    await db.query('INSERT INTO inhouse_subscriber_assignments(did_id,tenant_id,user_id,state,provisioned_at) VALUES($1,$2,$3,$4,$5)',[did.id,user.tenant_id,b.userId,state,state==='active'?new Date():null]);
    await db.query("UPDATE inhouse_dids SET user_id=$1,status='assigned',monthly_cents=0,setup_cents=0,invoice_id=NULL,reserved_until=NULL WHERE id=$2 AND tenant_id=$3",[b.userId,did.id,user.tenant_id]);
    result={assigned:true,state,number:did.number_e164};
   }else{await db.query('UPDATE inhouse_dids SET status=$1 WHERE id=$2 AND tenant_id=$3',[b.action==='enable'?'available':'disabled',did.id,user.tenant_id]);result={updated:true};}
  }
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),user.tenant_id,user.id,'inhouse_inventory_'+b.action]);
  await db.query('INSERT INTO inhouse_admin_actions(id,tenant_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,b.action,JSON.stringify({...b,reason:b.reason.trim()})]);
  await db.query('COMMIT');return result;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
