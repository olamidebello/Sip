import {randomUUID} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function migrateVoicemail(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS voicemail_mailboxes (
 user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,mailbox_id CHAR(36) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,max_seconds INT NOT NULL DEFAULT 120,
 revision INT UNSIGNED NOT NULL DEFAULT 1,applied_revision INT UNSIGNED NOT NULL DEFAULT 0,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY voicemail_box(mailbox_id),INDEX voicemail_tenant(tenant_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
 await provisionVoicemail(pool);
}
export async function provisionVoicemail(pool,tenant=null){
 await pool.query(`INSERT IGNORE INTO voicemail_mailboxes(user_id,tenant_id,mailbox_id)
 SELECT u.id,u.tenant_id,UUID() FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.status='active' AND t.status='active' AND ($1 IS NULL OR u.tenant_id=$1)`,[tenant]);
}
export async function authorizeVoicemailAccess(pool,user,domain){
 const r=await pool.query("SELECT id FROM sip_accounts WHERE tenant_id=$1 AND user_id=$2 AND domain=$3 AND status='active' LIMIT 1",[user.tenant_id,user.id,domain]);
 return r.rows.length?{allowed:true,scope:'voicemail',target:'sip:*98@'+domain}:{allowed:false,error:'An active SIP account is required for voicemail'};
}
export async function lookupVoicemail(pool,data){
 if(!/^[a-z0-9+_.-]{1,64}$/i.test(data.username||'')||!/^[-a-z0-9.]{1,253}$/i.test(data.domain||''))return [400,{error:'Invalid voicemail identity'}];
 const r=await pool.query(`SELECT DISTINCT m.mailbox_id,m.enabled,m.revision,m.applied_revision FROM sip_accounts a
 JOIN users u ON u.id=a.user_id AND u.tenant_id=a.tenant_id AND u.status='active'
 JOIN tenants t ON t.id=u.tenant_id AND t.status='active'
 JOIN voicemail_mailboxes m ON m.user_id=u.id AND m.tenant_id=u.tenant_id
 WHERE a.username=$1 AND a.domain=$2 AND a.status='active' LIMIT 2`,[data.username,data.domain]);
 const m=r.rows[0];if(r.rows.length!==1||!m||!Number(m.enabled)||Number(m.revision)!==Number(m.applied_revision)||!uuid.test(m.mailbox_id||''))return [480,{error:'Voicemail unavailable or provisioning pending'}];
 return [200,{mailbox:m.mailbox_id}];
}
export function validateVoicemail(input){
 if(typeof input?.enabled!=='boolean'||!Number.isInteger(input?.maxSeconds)||input.maxSeconds<30||input.maxSeconds>180||!Number.isSafeInteger(input.revision)||input.revision<1)throw Error('Enabled state, duration 30–180 seconds, and current revision required');
 return input;
}
export async function handleVoicemail({req,res,path,user,pool,send,readJson}){
 const admin=path.startsWith('/api/admin/voicemail');
 if(admin&&user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(admin&&path==='/api/admin/voicemail'&&req.method==='GET'){
 const rows=(await pool.query(`SELECT u.id,u.display_name,u.email,m.enabled,m.max_seconds,m.revision,m.applied_revision FROM users u LEFT JOIN voicemail_mailboxes m ON m.user_id=u.id AND m.tenant_id=u.tenant_id WHERE u.tenant_id=$1 ORDER BY u.display_name,u.id LIMIT 500`,[user.tenant_id])).rows;
 return send(res,200,{users:rows});
 }
 if(admin&&path==='/api/admin/voicemail/provision'&&req.method==='POST'){await provisionVoicemail(pool,user.tenant_id);return send(res,202,{queued:true,note:'Mailboxes created. Recorder synchronization runs every 30 seconds.'});}
 const match=admin?/^\/api\/admin\/voicemail\/users\/([a-f0-9-]{36})$/i.exec(path):null;
 if(admin&&!match||!admin&&path!=='/api/voicemail')return send(res,404,{error:'Voicemail route unavailable'});
 const target=admin?match[1]:user.id;if(!uuid.test(target))return send(res,400,{error:'Valid user required'});
 const found=(await pool.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2',[target,user.tenant_id])).rows[0];if(!found)return send(res,404,{error:'Workspace user unavailable'});
 await pool.query('INSERT IGNORE INTO voicemail_mailboxes(user_id,tenant_id,mailbox_id) VALUES($1,$2,$3)',[target,user.tenant_id,randomUUID()]);
 if(req.method==='GET'){
 const m=(await pool.query('SELECT enabled,max_seconds,revision,applied_revision FROM voicemail_mailboxes WHERE user_id=$1 AND tenant_id=$2',[target,user.tenant_id])).rows[0];
 return send(res,200,{enabled:!!Number(m.enabled),maxSeconds:Number(m.max_seconds),revision:Number(m.revision),provisioned:Number(m.revision)===Number(m.applied_revision),accessCode:'*98',ringSeconds:45});
 }
 if(req.method!=='PUT')return send(res,405,{error:'Use GET or PUT'});
 let b;try{b=validateVoicemail(await readJson(req));}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{await db.query('START TRANSACTION');
 const result=await db.query('UPDATE voicemail_mailboxes SET enabled=$1,max_seconds=$2,revision=revision+1 WHERE user_id=$3 AND tenant_id=$4 AND revision=$5',[b.enabled,b.maxSeconds,target,user.tenant_id,b.revision]);
 if(!result.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Mailbox changed; refresh before saving'});}
 await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'voicemail_settings_changed')",[randomUUID(),user.tenant_id,user.id,target]);
 await db.query('COMMIT');return send(res,200,{saved:true,pending:true});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
