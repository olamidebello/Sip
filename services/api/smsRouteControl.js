import {randomUUID} from 'node:crypto';
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v),phone=v=>typeof v==='string'&&/^\+[1-9]\d{7,14}$/.test(v);
export async function migrateSmsRouteControl(db){await db.query(`CREATE TABLE IF NOT EXISTS outbound_sms_routes(user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,mode VARCHAR(8) NOT NULL DEFAULT 'smart',sender_e164 VARCHAR(16) NULL,version INT NOT NULL DEFAULT 1,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);}
export async function outboundSmsRoute(db,user,input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Object.assign(Error('SMS object required'),{status:400});
 const r=(await db.query('SELECT mode,sender_e164 FROM outbound_sms_routes WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows[0];
 if(r?.mode==='block')throw Object.assign(Error('Outbound SMS disabled by administrator'),{status:403});
 const value={...input};
 if(r?.sender_e164){const sender=(await db.query('SELECT number_e164 FROM flowroute_sms_numbers WHERE tenant_id=$1 AND user_id=$2 AND number_e164=$3 AND enabled=TRUE',[user.tenant_id,user.id,r.sender_e164])).rows[0];if(!sender)throw Object.assign(Error('Configured outbound SMS sender is no longer assigned or enabled'),{status:403});value.from=r.sender_e164;}
 return {input:value,carrierOnly:r?.mode==='carrier'};
}
export async function handleSmsRouteControl({req,res,path,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});res.setHeader('Cache-Control','no-store');const root='/api/admin/sms-routing';
 if(path===root&&req.method==='GET'){
  const users=(await pool.query(`SELECT u.id,u.display_name,u.email,COALESCE(r.mode,'smart') AS outbound_mode,r.sender_e164,COALESCE(r.version,0) AS version,COALESCE(p.sms_to_email,FALSE) AS inbound_email,EXISTS(SELECT 1 FROM subscriber_email_verification v WHERE v.user_id=u.id AND v.email=u.email AND v.verified_at IS NOT NULL) AS email_verified FROM users u LEFT JOIN outbound_sms_routes r ON r.user_id=u.id AND r.tenant_id=u.tenant_id LEFT JOIN subscriber_routing_preferences p ON p.user_id=u.id WHERE u.tenant_id=$1 AND u.status='active' ORDER BY u.display_name,u.id`,[user.tenant_id])).rows;
  const senders=(await pool.query('SELECT number_e164,user_id FROM flowroute_sms_numbers WHERE tenant_id=$1 AND enabled=TRUE ORDER BY number_e164',[user.tenant_id])).rows;
  const jobs=(await pool.query("SELECT id,recipient_id,sender_number,status,attempts,created_at FROM subscriber_delivery_jobs WHERE tenant_id=$1 AND channel='email' ORDER BY created_at DESC,id DESC LIMIT 100",[user.tenant_id])).rows;
  return send(res,200,{users,senders,jobs,emailConfigured:!!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM),forwardingEnabled:process.env.SUBSCRIBER_ROUTING_ENABLED==='true'});
 }
 const match=new RegExp('^'+root+'/users/([a-f0-9-]{36})$','i').exec(path);
 if(!match||req.method!=='PUT')return send(res,405,{error:'Unsupported SMS routing action'});
 const b=await readJson(req);if(!b||!['smart','carrier','block'].includes(b.mode)||typeof b.inboundEmail!=='boolean'||!Number.isInteger(b.version)||b.version<0||b.sender!==''&&!phone(b.sender))return send(res,400,{error:'SMS mode, assigned sender, forwarding flag and current version required'});
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const target=(await db.query("SELECT id,email FROM users WHERE id=$1 AND tenant_id=$2 AND status='active' FOR UPDATE",[match[1],user.tenant_id])).rows[0];
  if(!target){await db.query('ROLLBACK');return send(res,404,{error:'Active user in this tenant required'});}
  if(b.sender&&!(await db.query('SELECT 1 FROM flowroute_sms_numbers WHERE tenant_id=$1 AND user_id=$2 AND number_e164=$3 AND enabled=TRUE FOR UPDATE',[user.tenant_id,target.id,b.sender])).rows.length){await db.query('ROLLBACK');return send(res,400,{error:'Select an enabled SMS number assigned to this user'});}
  if(b.inboundEmail){
   if(!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM)||process.env.SUBSCRIBER_ROUTING_ENABLED!=='true'){await db.query('ROLLBACK');return send(res,409,{error:'Configure the email provider and enable subscriber routing first'});}
   if(!(await db.query('SELECT 1 FROM subscriber_email_verification WHERE user_id=$1 AND email=$2 AND verified_at IS NOT NULL',[target.id,target.email])).rows.length){await db.query('ROLLBACK');return send(res,400,{error:'User must verify their current profile email before forwarding can be enabled'});}
  }
  const old=(await db.query('SELECT version FROM outbound_sms_routes WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[target.id,user.tenant_id])).rows[0];
  if(Number(old?.version||0)!==b.version){await db.query('ROLLBACK');return send(res,409,{error:'Routing changed; refresh before saving'});}
  if(old)await db.query('UPDATE outbound_sms_routes SET mode=$1,sender_e164=$2,version=version+1,updated_by=$3 WHERE user_id=$4 AND tenant_id=$5',[b.mode,b.sender||null,user.id,target.id,user.tenant_id]);
  else await db.query('INSERT INTO outbound_sms_routes(user_id,tenant_id,mode,sender_e164,updated_by) VALUES($1,$2,$3,$4,$5)',[target.id,user.tenant_id,b.mode,b.sender||null,user.id]);
  await db.query('INSERT INTO subscriber_routing_preferences(user_id,sms_to_email) VALUES($1,$2) ON DUPLICATE KEY UPDATE sms_to_email=VALUES(sms_to_email)',[target.id,b.inboundEmail]);
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,target.id,'sms_routing_'+b.mode+(b.inboundEmail?'_email_on':'_email_off')]);
  await db.query('COMMIT');return send(res,200,{saved:true,version:b.version+1});
 }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Routing changed; refresh before saving'});throw e;}finally{db.release();}
}
