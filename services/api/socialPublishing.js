import {randomBytes,randomUUID,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {navigationFor} from './navigationPolicy.js';
const providers=['facebook','x'];
function key(){const value=process.env.PROVIDER_CREDENTIAL_KEY;return /^[a-f0-9]{64}$/i.test(value||'')?Buffer.from(value,'hex'):null;}
function seal(value,user,provider){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);c.setAAD(Buffer.from(user.tenant_id+':'+user.id+':'+provider));return Buffer.concat([iv,c.update(value,'utf8'),c.final(),c.getAuthTag()]);}
function unseal(value,user,provider){const b=Buffer.from(value),c=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));c.setAAD(Buffer.from(user.tenant_id+':'+user.id+':'+provider));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString('utf8');}
export async function migrateSocialPublishing(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS social_publish_accounts(user_id CHAR(36) NOT NULL,provider VARCHAR(20) NOT NULL,account_id VARCHAR(100) NOT NULL,name VARCHAR(200) NOT NULL,token BLOB NOT NULL,PRIMARY KEY(user_id,provider),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS social_publish_attempts(id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,provider VARCHAR(20) NOT NULL,request_key CHAR(36) NOT NULL,body_hash CHAR(64) NOT NULL,status VARCHAR(20) NOT NULL,external_id VARCHAR(200) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),UNIQUE(user_id,request_key),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
}
export async function verifySocialAccount(provider,token,fetchImpl=fetch){
 const url=provider==='facebook'?'https://graph.facebook.com/v26.0/me?fields=id,name':'https://api.x.com/2/users/me';
 const r=await fetchImpl(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});const json=await r.json();const data=provider==='x'?json.data:json;if(!r.ok||!data?.id||!data.name)throw Error('Account authorization failed');
 if(provider==='facebook'){const page=await fetchImpl('https://graph.facebook.com/v26.0/'+encodeURIComponent(data.id)+'?fields=id,category',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});const p=await page.json();if(!page.ok||!p.category)throw Error('Facebook Page token required');}
 return {id:String(data.id),name:String(data.name).slice(0,200)};
}
export async function publishSocialText(provider,account,token,text,fetchImpl=fetch){
 const url=provider==='facebook'?'https://graph.facebook.com/v26.0/'+encodeURIComponent(account)+'/feed':'https://api.x.com/2/tweets';
 const r=await fetchImpl(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(provider==='facebook'?{message:text}:{text}),signal:AbortSignal.timeout(20000)});
 const b=await r.json();if(!r.ok)throw Error('Provider rejected the post');const id=provider==='facebook'?b.id:b.data?.id;if(!id)throw Error('Provider result unavailable');return String(id);
}
export async function handleSocialPublishing({req,res,path,user,pool,send,readJson,fetchImpl=fetch}){
 if(!(await navigationFor(pool,user)).social)return send(res,403,{error:'Social unavailable'});
 if(path==='/api/social/publishing'&&req.method==='GET')return send(res,200,{keyReady:!!key(),providers,accounts:(await pool.query('SELECT provider,account_id,name FROM social_publish_accounts WHERE user_id=$1',[user.id])).rows,attempts:(await pool.query('SELECT id,provider,status,external_id,created_at FROM social_publish_attempts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30',[user.id])).rows});
 const m=/^\/api\/social\/publishing\/(facebook|x)(?:\/(post))?$/.exec(path);if(!m)return send(res,404,{error:'Publishing route unavailable'});const provider=m[1];
 if(!m[2]&&req.method==='DELETE'){await pool.query('DELETE FROM social_publish_accounts WHERE user_id=$1 AND provider=$2',[user.id,provider]);return send(res,200,{disconnected:true});}
 if(!key())return send(res,409,{error:'Server provider encryption key required'});
 if(!m[2]&&req.method==='PUT'){
 const b=await readJson(req);if(typeof b.token!=='string'||b.token.length<20||b.token.length>4000||/\s/.test(b.token))return send(res,400,{error:'Authorized user/Page access token required'});
 let identity;try{identity=await verifySocialAccount(provider,b.token,fetchImpl);}catch{return send(res,400,{error:'Account verification failed. Facebook requires a Page token; X requires a user token with publishing access.'});}
 await pool.query('INSERT INTO social_publish_accounts(user_id,provider,account_id,name,token) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id),name=VALUES(name),token=VALUES(token)',[user.id,provider,identity.id,identity.name,seal(b.token,user,provider)]);return send(res,200,{provider,name:identity.name});
 }
 if(m[2]&&req.method==='POST'){
 const b=await readJson(req);if(b.confirm!==true||typeof b.text!=='string'||!b.text.trim()||Array.from(b.text).length>(provider==='x'?280:4000)||! /^[0-9a-f-]{36}$/i.test(b.requestKey||''))return send(res,400,{error:'Text, confirmation and unique request ID required'});
 const hash=createHash('sha256').update(provider+':'+b.text).digest('hex'),id=randomUUID();
 const account=(await pool.query('SELECT account_id,token FROM social_publish_accounts WHERE user_id=$1 AND provider=$2',[user.id,provider])).rows[0];if(!account)return send(res,409,{error:'Connect this account first'});
 const old=(await pool.query('SELECT status,external_id,body_hash FROM social_publish_attempts WHERE user_id=$1 AND request_key=$2',[user.id,b.requestKey])).rows[0];if(old)return send(res,old.body_hash===hash?200:409,{status:old.status,externalId:old.external_id,note:'Existing request; no post resent'});
 try{await pool.query("INSERT INTO social_publish_attempts(id,user_id,provider,request_key,body_hash,status) VALUES($1,$2,$3,$4,$5,'sending')",[id,user.id,provider,b.requestKey,hash]);}catch(e){if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'This publishing request already exists; refresh delivery status'});throw e;}
 try{const externalId=await publishSocialText(provider,account.account_id,unseal(account.token,user,provider),b.text,fetchImpl);await pool.query("UPDATE social_publish_attempts SET status='published',external_id=$1 WHERE id=$2",[externalId,id]);return send(res,200,{status:'published',externalId});}
 catch{await pool.query("UPDATE social_publish_attempts SET status='unknown' WHERE id=$1",[id]);return send(res,502,{error:'Publication was not confirmed. Check the external account before trying again; no automatic retry.',status:'unknown'});}
 }
 return send(res,405,{error:'Method unavailable'});
}
