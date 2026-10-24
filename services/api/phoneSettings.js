import {randomUUID} from 'node:crypto';
const uuid=/^[a-f0-9-]{36}$/i;
export const phoneDefaults=Object.freeze({dnd:false,callWaiting:true,forwardMode:'off',forwardUser:null,ringSeconds:30});
export function validatePhoneSettings(b){
 if(!b||typeof b.dnd!=='boolean'||typeof b.callWaiting!=='boolean'||!['off','always','busy','unanswered'].includes(b.forwardMode)||!Number.isInteger(b.ringSeconds)||b.ringSeconds<10||b.ringSeconds>60||!Number.isSafeInteger(b.revision)||b.revision<0|| (b.forwardMode!=='off'&&!uuid.test(b.forwardUser||'')))throw Error('Valid phone settings, ring time 10–60 seconds and current revision required');
 return {...b,forwardUser:b.forwardMode==='off'?null:b.forwardUser};
}
export async function migratePhoneSettings(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS user_phone_settings (
 user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,dnd BOOLEAN NOT NULL DEFAULT FALSE,
 call_waiting BOOLEAN NOT NULL DEFAULT TRUE,forward_mode VARCHAR(16) NOT NULL DEFAULT 'off',
 forward_user CHAR(36) NULL,ring_seconds INT NOT NULL DEFAULT 30,revision INT NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,tenant_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
}
const destinationSql=`SELECT a.username,a.domain,u.id,u.display_name FROM users u JOIN tenants t ON t.id=u.tenant_id AND t.status='active' JOIN sip_accounts a ON a.user_id=u.id AND a.tenant_id=u.tenant_id AND a.status='active' JOIN contacts c ON c.contact_id=u.id AND c.owner_id=$1 JOIN user_presence p ON p.user_id=u.id AND p.accept_forwarded=true WHERE u.id=$2 AND u.tenant_id=$3 AND u.status='active' LIMIT 2`;
export async function handlePhoneSettings({req,res,user,pool,send,readJson}){
 if(req.method==='GET'){
 const row=(await pool.query('SELECT * FROM user_phone_settings WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows[0];
 const contacts=(await pool.query(`SELECT DISTINCT u.id,u.display_name,u.email FROM contacts c JOIN users u ON u.id=c.contact_id JOIN user_presence p ON p.user_id=u.id AND p.accept_forwarded=true WHERE c.owner_id=$1 AND u.tenant_id=$2 AND u.status='active' AND u.id<>$1 ORDER BY u.display_name LIMIT 500`,[user.id,user.tenant_id])).rows;
 return send(res,200,{...phoneDefaults,...(row?{dnd:!!Number(row.dnd),callWaiting:!!Number(row.call_waiting),forwardMode:row.forward_mode,forwardUser:row.forward_user,ringSeconds:Number(row.ring_seconds)}:{}),revision:Number(row?.revision||0),contacts});
 }
 if(req.method!=='PUT')return send(res,405,{error:'Use GET or PUT'});
 let b;try{b=validatePhoneSettings(await readJson(req));}catch(e){return send(res,400,{error:e.message});}
 if(b.forwardUser){const rows=(await pool.query(destinationSql,[user.id,b.forwardUser,user.tenant_id])).rows;if(b.forwardUser===user.id||rows.length!==1)return send(res,400,{error:'Select a contact with one active SIP account who accepts forwarded calls'});}
 const db=await pool.connect();try{
 await db.query('START TRANSACTION');
 await db.query('INSERT IGNORE INTO user_phone_settings(user_id,tenant_id) VALUES($1,$2)',[user.id,user.tenant_id]);
 const r=await db.query('UPDATE user_phone_settings SET dnd=$1,call_waiting=$2,forward_mode=$3,forward_user=$4,ring_seconds=$5,revision=revision+1 WHERE user_id=$6 AND tenant_id=$7 AND revision=$8',[b.dnd,b.callWaiting,b.forwardMode,b.forwardUser,b.ringSeconds,user.id,user.tenant_id,b.revision]);
 if(!r.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Settings changed; refresh before saving'});}
 await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$3,'phone_settings_changed')",[randomUUID(),user.tenant_id,user.id]);
 await db.query('COMMIT');return send(res,200,{saved:true});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function phoneRoutingPolicy(pool,data){
 if(!/^[a-z0-9+_.-]{1,64}$/i.test(data.username||'')||!/^[-a-z0-9.]{1,253}$/i.test(data.domain||'')||!['initial','busy','unanswered'].includes(data.reason))return [400,{error:'Invalid phone lookup'}];
 const rows=(await pool.query(`SELECT u.id,u.tenant_id,p.dnd,p.call_waiting,p.forward_mode,p.forward_user,p.ring_seconds FROM sip_accounts a JOIN users u ON u.id=a.user_id AND u.tenant_id=a.tenant_id AND u.status='active' JOIN tenants t ON t.id=u.tenant_id AND t.status='active' LEFT JOIN user_phone_settings p ON p.user_id=u.id AND p.tenant_id=u.tenant_id WHERE a.username=$1 AND a.domain=$2 AND a.status='active' LIMIT 2`,[data.username,data.domain])).rows;
 if(rows.length!==1)return [404,{error:'Unique active subscriber required'}];
 const p=rows[0],result={action:'ring',ringSeconds:Number(p.ring_seconds||30),callWaiting:p.call_waiting==null?true:!!Number(p.call_waiting)};
 if(data.reason==='initial'&&Number(p.dnd))return [200,{...result,action:'voicemail'}];
 if(p.forward_user&&p.forward_user!==p.id&&(p.forward_mode==='always'&&data.reason==='initial'||p.forward_mode===data.reason)){
 const dest=(await pool.query(destinationSql,[p.id,p.forward_user,p.tenant_id])).rows;
 if(dest.length===1){const target=(await pool.query('SELECT dnd FROM user_phone_settings WHERE user_id=$1 AND tenant_id=$2',[p.forward_user,p.tenant_id])).rows[0];if(!Number(target?.dnd))return [200,{...result,action:'forward',username:dest[0].username,domain:dest[0].domain}];}
 return [200,{...result,action:'voicemail'}];
 }
 return [200,result];
}
