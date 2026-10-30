import {randomUUID,createHash} from 'node:crypto';
export async function migrateAlertBroadcasts(db){
 await db.query(`CREATE TABLE IF NOT EXISTS system_alert_broadcasts(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,request_key CHAR(36) NOT NULL,audience_hash CHAR(64) NOT NULL,title VARCHAR(120) NOT NULL,body TEXT NOT NULL,level VARCHAR(16) NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),UNIQUE KEY broadcast_once(tenant_id,request_key),INDEX broadcast_tenant(tenant_id,created_at)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS system_alert_recipients(message_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,PRIMARY KEY(message_id,user_id),INDEX alert_recipient(user_id,tenant_id)) ENGINE=InnoDB`);
}
export function validateBroadcast(b){if(!b||!['all','group','subscriber'].includes(b.audience)||!['info','warning','error'].includes(b.level)||typeof b.title!=='string'||!b.title.trim()||b.title.length>120||typeof b.body!=='string'||!b.body.trim()||b.body.length>2000||b.audience!=='all'&&!/^[a-f0-9-]{36}$/i.test(b.targetId||''))throw Error('Title, message, severity and audience required');return {audience:b.audience,targetId:b.audience==='all'?null:b.targetId,title:b.title.trim(),body:b.body.trim(),level:b.level};}
export function audienceHash(user,body,ids){return createHash('sha256').update(JSON.stringify([user.tenant_id,user.id,body,[...ids].sort()])).digest('hex');}
async function recipients(db,user,b){
 if(b.audience==='group'&&!(await db.query('SELECT id FROM user_groups WHERE id=$1 AND tenant_id=$2',[b.targetId,user.tenant_id])).rows.length)throw Error('Group must belong to selected workspace');
 let sql="SELECT u.id FROM users u WHERE u.tenant_id=$1 AND u.status='active'",args=[user.tenant_id];
 if(b.audience==='subscriber'){sql+=' AND u.id=$2';args.push(b.targetId);}if(b.audience==='group'){sql+=' AND EXISTS(SELECT 1 FROM user_group_members m WHERE m.user_id=u.id AND m.group_id=$2)';args.push(b.targetId);}
 return (await db.query(sql+' ORDER BY u.id',args)).rows.map(r=>r.id);
}
export async function userBroadcasts(db,user){return (await db.query('SELECT b.id,b.title,b.body,b.level,b.created_at FROM system_alert_recipients r JOIN system_alert_broadcasts b ON b.id=r.message_id AND b.tenant_id=r.tenant_id WHERE r.user_id=$1 AND r.tenant_id=$2 AND b.active=TRUE ORDER BY b.created_at DESC LIMIT 100',[user.id,user.tenant_id])).rows.map(b=>({id:'broadcast/'+b.id,title:b.title,message:b.body,level:b.level,at:b.created_at}));}
export async function handleAlertBroadcasts({req,res,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});res.setHeader('Cache-Control','no-store');
 if(req.method==='GET')return send(res,200,{messages:(await pool.query('SELECT b.id,b.title,b.body,b.level,b.active,b.created_at,COUNT(r.user_id) AS recipients FROM system_alert_broadcasts b LEFT JOIN system_alert_recipients r ON r.message_id=b.id AND r.tenant_id=b.tenant_id WHERE b.tenant_id=$1 GROUP BY b.id ORDER BY b.created_at DESC LIMIT 100',[user.tenant_id])).rows,groups:(await pool.query('SELECT id,name FROM user_groups WHERE tenant_id=$1 ORDER BY name',[user.tenant_id])).rows,users:(await pool.query("SELECT id,display_name FROM users WHERE tenant_id=$1 AND status='active' ORDER BY display_name LIMIT 1000",[user.tenant_id])).rows});
 if(req.method!=='POST')return send(res,405,{error:'GET or POST required'});const input=await readJson(req);
 if(input.action==='withdraw'){
  if(!/^[a-f0-9-]{36}$/i.test(input.id||''))return send(res,400,{error:'Alert ID required'});
  await pool.query('UPDATE system_alert_broadcasts SET active=FALSE WHERE id=$1 AND tenant_id=$2',[input.id,user.tenant_id]);return send(res,200,{withdrawn:true});
 }
 let body;try{body=validateBroadcast(input);}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);const ids=await recipients(db,user,body),digest=audienceHash(user,body,ids);
 if(input.action==='preview'){await db.query('ROLLBACK');return send(res,200,{recipients:ids.length,audienceHash:digest,scope:'Selected workspace only'});}
 if(input.action!=='send'||input.confirm!==true||!ids.length||input.audienceHash!==digest||!/^[a-f0-9-]{36}$/i.test(input.requestKey||''))throw Error('Preview the current audience and confirm before sending');
 const prior=(await db.query('SELECT id,audience_hash,actor_id FROM system_alert_broadcasts WHERE tenant_id=$1 AND request_key=$2',[user.tenant_id,input.requestKey])).rows[0];if(prior){if(prior.audience_hash!==digest||prior.actor_id!==user.id)throw Error('Request key already used');await db.query('COMMIT');return send(res,200,{id:prior.id,duplicate:true});}
 const id=randomUUID();await db.query('INSERT INTO system_alert_broadcasts(id,tenant_id,actor_id,request_key,audience_hash,title,body,level) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,user.tenant_id,user.id,input.requestKey,digest,body.title,body.body,body.level]);
 for(let i=0;i<ids.length;i+=500){const chunk=ids.slice(i,i+500),args=[];const values=chunk.map(u=>{const n=args.length;args.push(id,u,user.tenant_id);return `($${n+1},$${n+2},$${n+3})`;});await db.query('INSERT INTO system_alert_recipients(message_id,user_id,tenant_id) VALUES '+values.join(','),args);}
 await db.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),user.tenant_id,user.id,'system_alert_broadcast_sent']);await db.query('COMMIT');return send(res,200,{id,recipients:ids.length});
 }catch(e){await db.query('ROLLBACK');return send(res,409,{error:e.code?'Alert operation unavailable':e.message});}finally{db.release();}
}
