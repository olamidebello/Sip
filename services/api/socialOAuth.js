import {randomBytes,createHash} from 'node:crypto';
import {seal,verifySocialAccount} from './socialPublishing.js';
const definitions={
 facebook:{authorize:'https://www.facebook.com/v26.0/dialog/oauth',token:'https://graph.facebook.com/v26.0/oauth/access_token',scope:'pages_show_list,pages_read_engagement,pages_manage_posts'},
 x:{authorize:'https://x.com/i/oauth2/authorize',token:'https://api.x.com/2/oauth2/token',scope:'tweet.read tweet.write users.read offline.access'},
 linkedin:{authorize:'https://www.linkedin.com/oauth/v2/authorization',token:'https://www.linkedin.com/oauth/v2/accessToken',scope:'openid profile w_member_social'}
};
function config(provider){const prefix='SOCIAL_'+provider.toUpperCase();return {id:process.env[prefix+'_CLIENT_ID'],secret:process.env[prefix+'_CLIENT_SECRET']};}
export function configuredProviders(){return Object.keys(definitions).filter(p=>{const c=config(p);return c.id&&c.secret;});}
function redirect(){const u=new URL(process.env.PUBLIC_ORIGIN);if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash)throw Error('HTTPS public origin required');return u.origin+'/social-oauth-callback.html';}
export async function migrateSocialOAuth(pool){await pool.query(`CREATE TABLE IF NOT EXISTS social_oauth_states(state_hash CHAR(64) PRIMARY KEY,user_id CHAR(36) NOT NULL,provider VARCHAR(20) NOT NULL,verifier VARCHAR(100) NOT NULL,expires_at DATETIME(3) NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);await pool.query(`CREATE TABLE IF NOT EXISTS social_oauth_pages(user_id CHAR(36) NOT NULL,account_id VARCHAR(100) NOT NULL,name VARCHAR(200) NOT NULL,token BLOB NOT NULL,expires_at DATETIME(3) NOT NULL,PRIMARY KEY(user_id,account_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);}
export async function handleSocialOAuth({req,res,path,user,pool,send,readJson,fetchImpl=fetch}){
 const m=/^\/api\/social\/publishing\/oauth\/(facebook|x|linkedin)\/(start|complete|pages|select)$/.exec(path);if(!m)return send(res,404,{error:'OAuth route unavailable'});
 const [,provider,action]=m,c=config(provider),d=definitions[provider];if(!c.id||!c.secret)return send(res,409,{error:'Administrator must configure this provider app first'});
 if(!/^[a-f0-9]{64}$/i.test(process.env.PROVIDER_CREDENTIAL_KEY||''))return send(res,409,{error:'Provider encryption key required'});
 if(action==='pages'&&provider==='facebook'&&req.method==='GET')return send(res,200,{pages:(await pool.query('SELECT account_id,name FROM social_oauth_pages WHERE user_id=$1 AND expires_at>NOW()',[user.id])).rows});
 if(req.method!=='POST')return send(res,405,{error:'POST required'});
 if(action==='start'){
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 await pool.query('DELETE FROM social_oauth_states WHERE expires_at<NOW()');await pool.query('DELETE FROM social_oauth_pages WHERE expires_at<NOW()');
 await pool.query('INSERT INTO social_oauth_states(state_hash,user_id,provider,verifier,expires_at) VALUES($1,$2,$3,$4,DATE_ADD(NOW(),INTERVAL 10 MINUTE))',[createHash('sha256').update(state).digest('hex'),user.id,provider,verifier]);
 const u=new URL(d.authorize);for(const [k,v] of Object.entries({client_id:c.id,redirect_uri:redirect(),response_type:'code',scope:d.scope,state}))u.searchParams.set(k,v);
 if(provider==='x'){u.searchParams.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));u.searchParams.set('code_challenge_method','S256');}
 return send(res,200,{url:u.href,state});
 }
 const b=await readJson(req);
 if(action==='select'&&provider==='facebook'){
 const page=(await pool.query('SELECT account_id,name,token FROM social_oauth_pages WHERE user_id=$1 AND account_id=$2 AND expires_at>NOW()',[user.id,String(b.accountId||'')])).rows[0];if(!page)return send(res,400,{error:'Authorize again and choose an available Page'});
 await pool.query('INSERT INTO social_publish_accounts(user_id,provider,account_id,name,token) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id),name=VALUES(name),token=VALUES(token)',[user.id,provider,page.account_id,page.name,page.token]);await pool.query('DELETE FROM social_oauth_pages WHERE user_id=$1',[user.id]);return send(res,200,{connected:true});
 }
 if(action!=='complete'||typeof b.state!=='string'||b.state.length>200||typeof b.code!=='string'||b.code.length>4000)return send(res,400,{error:'Authorization code and state required'});
 const hash=createHash('sha256').update(b.state).digest('hex');const record=(await pool.query('SELECT verifier FROM social_oauth_states WHERE state_hash=$1 AND user_id=$2 AND provider=$3 AND expires_at>NOW()',[hash,user.id,provider])).rows[0];if(!record)return send(res,400,{error:'Authorization expired or invalid'});
 const used=await pool.query('DELETE FROM social_oauth_states WHERE state_hash=$1 AND user_id=$2 AND provider=$3 AND expires_at>NOW()',[hash,user.id,provider]);if(used.rowCount!==1)return send(res,400,{error:'Authorization already used'});
 try{
 const form=new URLSearchParams({grant_type:'authorization_code',code:b.code,redirect_uri:redirect(),client_id:c.id});const headers={'Content-Type':'application/x-www-form-urlencoded'};
 if(provider==='x'){form.set('code_verifier',record.verifier);headers.Authorization='Basic '+Buffer.from(c.id+':'+c.secret).toString('base64');}else form.set('client_secret',c.secret);
 const r=await fetchImpl(d.token,{method:'POST',headers,body:form.toString(),signal:AbortSignal.timeout(15000)}),token=await r.json();if(!r.ok||!token.access_token)throw Error('Token exchange failed');
 if(provider==='facebook'){
 const response=await fetchImpl('https://graph.facebook.com/v26.0/me/accounts?fields=id,name,access_token,tasks&limit=100',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)}),pages=await response.json();if(!response.ok||!Array.isArray(pages.data))throw Error('Pages unavailable');
 await pool.query('DELETE FROM social_oauth_pages WHERE user_id=$1',[user.id]);const choices=[];for(const p of pages.data){if(!p.access_token||!p.tasks?.some(t=>['CREATE_CONTENT','MANAGE'].includes(t)))continue;await pool.query('INSERT INTO social_oauth_pages(user_id,account_id,name,token,expires_at) VALUES($1,$2,$3,$4,DATE_ADD(NOW(),INTERVAL 10 MINUTE))',[user.id,String(p.id),String(p.name).slice(0,200),seal(p.access_token,user,provider)]);choices.push({account_id:String(p.id),name:String(p.name).slice(0,200)});}return send(res,200,{pages:choices});
 }
 const identity=await verifySocialAccount(provider,token.access_token,fetchImpl);await pool.query('INSERT INTO social_publish_accounts(user_id,provider,account_id,name,token) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id),name=VALUES(name),token=VALUES(token)',[user.id,provider,identity.id,identity.name,seal(token.access_token,user,provider)]);return send(res,200,{connected:true,name:identity.name});
 }catch{return send(res,400,{error:'Social authorization failed. Check app permissions or reconnect.'});}
}
