import {randomUUID} from 'node:crypto';
export function validateAccountRange(input){
 if(!Number.isSafeInteger(input.start)||!Number.isSafeInteger(input.end)||input.start<1||input.end<input.start||input.end>999999999999||typeof input.enabled!=='boolean'||!Number.isInteger(input.revision)||input.revision<0)throw Error('Provide a valid range, enabled state and current revision');
 return input;
}
export async function migrateAccountRanges(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS tenant_account_ranges(tenant_id CHAR(36) PRIMARY KEY,range_start BIGINT UNSIGNED NOT NULL,range_end BIGINT UNSIGNED NOT NULL,next_number BIGINT UNSIGNED NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,revision INT UNSIGNED NOT NULL DEFAULT 1,updated_by CHAR(36) NOT NULL,FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS user_account_numbers(user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,account_number BIGINT UNSIGNED NOT NULL,assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),UNIQUE KEY tenant_account_number(tenant_id,account_number),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
}
const config=row=>row?{start:Number(row.range_start),end:Number(row.range_end),next:Number(row.next_number),enabled:!!Number(row.enabled),revision:Number(row.revision)}:null;
export async function handleAccountRanges({req,res,path,user,pool,send,readJson}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const tenant=user.tenant_id;
 if(path==='/api/admin/account-range'&&req.method==='GET'){
  const [range,users]=await Promise.all([pool.query('SELECT * FROM tenant_account_ranges WHERE tenant_id=$1',[tenant]),pool.query('SELECT u.id,u.display_name,n.account_number FROM users u LEFT JOIN user_account_numbers n ON n.user_id=u.id AND n.tenant_id=u.tenant_id WHERE u.tenant_id=$1 AND u.status=\'active\' ORDER BY u.display_name,u.id LIMIT 500',[tenant])]);
  return send(res,200,{config:config(range.rows[0]),users:users.rows.map(u=>({...u,account_number:u.account_number==null?null:Number(u.account_number)}))});
 }
 if(!((path==='/api/admin/account-range'&&req.method==='PUT')||(path==='/api/admin/account-range/assign'&&req.method==='POST')))return send(res,405,{error:'Method unavailable'});
 let body;try{body=await readJson(req);if(req.method==='PUT')validateAccountRange(body);else if(!/^[a-f0-9-]{36}$/i.test(body.userId||''))throw Error('Valid user ID required');}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const range=(await db.query('SELECT * FROM tenant_account_ranges WHERE tenant_id=$1 FOR UPDATE',[tenant])).rows[0];
  if(req.method==='PUT'){
   if(Number(range?.revision||0)!==body.revision){await db.query('ROLLBACK');return send(res,409,{error:'Range changed; refresh before saving'});}
   const bounds=(await db.query('SELECT MIN(account_number) AS low,MAX(account_number) AS high FROM user_account_numbers WHERE tenant_id=$1',[tenant])).rows[0];
   if(bounds?.low!=null&&(Number(bounds.low)<body.start||Number(bounds.high)>body.end)){await db.query('ROLLBACK');return send(res,409,{error:'Range must include existing assigned account numbers'});}
   const next=Math.max(body.start,Number(range?.next_number||0),Number(bounds?.high||0)+1);
   await db.query('INSERT INTO tenant_account_ranges(tenant_id,range_start,range_end,next_number,enabled,revision,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON DUPLICATE KEY UPDATE range_start=VALUES(range_start),range_end=VALUES(range_end),next_number=VALUES(next_number),enabled=VALUES(enabled),revision=VALUES(revision),updated_by=VALUES(updated_by)',[tenant,body.start,body.end,next,body.enabled,body.revision+1,user.id]);
   await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,$4)',[randomUUID(),tenant,user.id,'account_range_saved']);
   await db.query('COMMIT');return send(res,200,{saved:true,revision:body.revision+1});
  }
  const target=(await db.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active'",[body.userId,tenant])).rows[0];
  if(!target){await db.query('ROLLBACK');return send(res,404,{error:'User unavailable in this workspace'});}
  const existing=(await db.query('SELECT account_number FROM user_account_numbers WHERE user_id=$1 AND tenant_id=$2',[body.userId,tenant])).rows[0];
  if(existing){await db.query('COMMIT');return send(res,200,{accountNumber:Number(existing.account_number),existing:true});}
  if(!range||!Number(range.enabled)||Number(range.next_number)>Number(range.range_end)){await db.query('ROLLBACK');return send(res,409,{error:'Configure an enabled range with remaining numbers'});}
  const number=Number(range.next_number);
  await db.query('INSERT INTO user_account_numbers(user_id,tenant_id,account_number) VALUES($1,$2,$3)',[body.userId,tenant,number]);
  await db.query('UPDATE tenant_account_ranges SET next_number=next_number+1,revision=revision+1 WHERE tenant_id=$1',[tenant]);
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),tenant,user.id,body.userId,'account_number_assigned']);
  await db.query('COMMIT');return send(res,200,{accountNumber:number,existing:false});
 }catch(e){await db.query('ROLLBACK');if(['ER_DUP_ENTRY','ER_LOCK_DEADLOCK'].includes(e.code))return send(res,409,{error:'Concurrent allocation changed; refresh and retry'});throw e;}finally{db.release();}
}
