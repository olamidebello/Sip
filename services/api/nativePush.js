import {readFile} from 'node:fs/promises';
import {createSign,createHash,randomUUID,timingSafeEqual} from 'node:crypto';
let oauth;
export function pushHookAuthorized(req){
 const configured=process.env.NATIVE_PUSH_HOOK_TOKEN||'',provided=(req.headers.authorization||'').replace(/^Bearer /,'');
 return configured.length>=32&&Buffer.byteLength(configured)===Buffer.byteLength(provided)&&timingSafeEqual(Buffer.from(configured),Buffer.from(provided));
}
export async function migrateNativePush(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS native_push_devices (
 id CHAR(64) PRIMARY KEY,user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,token VARCHAR(4096) NOT NULL,session_hash CHAR(64) NOT NULL,
 expires_at DATETIME(3) NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS native_push_jobs (
 id CHAR(36) PRIMARY KEY,device_id CHAR(64) NOT NULL,event_key CHAR(64) NOT NULL,payload JSON NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,
 expires_at DATETIME(3) NOT NULL,next_attempt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(device_id) REFERENCES native_push_devices(id) ON DELETE CASCADE,
 UNIQUE KEY push_event_device(event_key,device_id), INDEX push_pending(status,next_attempt)) ENGINE=InnoDB`);
}
export function pushMessage(token,data){
 return {message:{token,data,android:{priority:'high',ttl:'45s'}}};
}
export function serviceAccountAssertion(service,now=Math.floor(Date.now()/1000)){
 const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const claim=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:service.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
 const signature=createSign('RSA-SHA256').update(claim).sign(service.private_key).toString('base64url');return claim+'.'+signature;
}
async function sendFcm(token,data){
 const service=JSON.parse(await readFile(process.env.NATIVE_PUSH_SERVICE_ACCOUNT_FILE,'utf8'));
 if(!/^[a-z][a-z0-9-]{4,62}$/.test(service.project_id||''))throw Error('Invalid Firebase project');
 if(!oauth||oauth.project!==service.project_id||oauth.expires<Date.now()+60000){
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:serviceAccountAssertion(service)})});
  if(!response.ok)throw Error('Firebase authorization failed');const result=await response.json();if(!result.access_token)throw Error('Firebase token unavailable');
  oauth={token:result.access_token,project:service.project_id,expires:Date.now()+Number(result.expires_in||3600)*1000};
 }
 const response=await fetch(`https://fcm.googleapis.com/v1/projects/${service.project_id}/messages:send`,{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+oauth.token,'Content-Type':'application/json'},body:JSON.stringify(pushMessage(token,data))});
 if(!response.ok){const body=await response.json().catch(()=>({}));const error=Error('FCM delivery failed');error.unregistered=body.error?.details?.some(d=>d.errorCode==='UNREGISTERED');throw error;}
}
export async function handleNativePush({req,res,path,user,pool,send,readJson,sessionHash}){
 if(path==='/api/native-push/wake'){
  if(req.method!=='POST'||!pushHookAuthorized(req))return send(res,403,{error:'Trusted SIP hook required'});
  const {username,domain,callId}=await readJson(req);
  if(!/^[a-z0-9+_.-]{1,64}$/i.test(username||'')||!/^[a-z0-9.-]{1,253}$/i.test(domain||'')||typeof callId!=='string'||!callId.length||callId.length>512)return send(res,400,{error:'Valid SIP recipient and call ID required'});
  const owner=(await pool.query(`SELECT a.user_id,a.tenant_id,p.presence FROM sip_accounts a JOIN users u ON u.id=a.user_id AND u.tenant_id=a.tenant_id JOIN tenants t ON t.id=a.tenant_id LEFT JOIN user_presence p ON p.user_id=u.id
    WHERE a.username=$1 AND a.domain=$2 AND a.status='active' AND u.status='active' AND t.status='active'`,[username,domain.toLowerCase()])).rows[0];
  if(!owner||owner.presence==='dnd')return send(res,404,{error:'Recipient unavailable'});
  const devices=(await pool.query('SELECT id FROM native_push_devices WHERE user_id=$1 AND tenant_id=$2 AND expires_at>NOW(3)',[owner.user_id,owner.tenant_id])).rows;
  const event=createHash('sha256').update(domain.toLowerCase()+'\0'+callId).digest('hex');
  for(const device of devices)await pool.query(`INSERT IGNORE INTO native_push_jobs(id,device_id,event_key,payload,expires_at) VALUES($1,$2,$3,$4,DATE_ADD(NOW(3),INTERVAL 45 SECOND))`,[randomUUID(),device.id,event,JSON.stringify({kind:'incoming_call',callId,expiresAt:String(Date.now()+45000)})]);
  return send(res,202,{queued:devices.length});
 }
 if(!user)return send(res,401,{error:'Sign in required'});
 if(path==='/api/native-push/device'&&['POST','DELETE'].includes(req.method)){
  const {token}=await readJson(req);
  if(typeof token!=='string'||token.length<20||token.length>4096||/\s/.test(token))return send(res,400,{error:'Valid native device token required'});
  const id=createHash('sha256').update(token).digest('hex');
  if(req.method==='DELETE')await pool.query('DELETE FROM native_push_devices WHERE id=$1 AND user_id=$2',[id,user.id]);
  else {
   if(!process.env.NATIVE_PUSH_SERVICE_ACCOUNT_FILE)return send(res,503,{error:'Native push is not configured'});
   await pool.query(`INSERT INTO native_push_devices(id,user_id,tenant_id,token,session_hash,expires_at) VALUES($1,$2,$3,$4,$5,DATE_ADD(NOW(3),INTERVAL 30 DAY))
    ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),tenant_id=VALUES(tenant_id),token=VALUES(token),session_hash=VALUES(session_hash),expires_at=VALUES(expires_at)`,[id,user.id,user.tenant_id,token,sessionHash]);
  }
  return send(res,200,{status:req.method==='DELETE'?'removed':'registered'});
 }
 return send(res,404,{error:'Native push route unavailable'});
}
export function startNativePush(pool){
 let stopped=false,timer;
 async function tick(){
  try{
   await pool.query("UPDATE native_push_jobs SET status='pending' WHERE status='sending' AND next_attempt<=NOW(3) AND expires_at>NOW(3) AND attempts<3");
   await pool.query("UPDATE native_push_jobs SET status='expired' WHERE expires_at<=NOW(3) AND status IN ('pending','sending')");
   const db=await pool.connect();let jobs=[];
   try{await db.query('BEGIN');jobs=(await db.query(`SELECT j.id,j.payload,j.attempts,d.token FROM native_push_jobs j JOIN native_push_devices d ON d.id=j.device_id JOIN users u ON u.id=d.user_id AND u.tenant_id=d.tenant_id JOIN tenants t ON t.id=d.tenant_id JOIN sessions s ON s.token_hash=d.session_hash AND s.user_id=d.user_id AND s.expires_at>NOW(3)
     WHERE j.status='pending' AND j.next_attempt<=NOW(3) AND j.expires_at>NOW(3) AND d.expires_at>NOW(3) AND u.status='active' AND t.status='active'
     ORDER BY j.next_attempt LIMIT 10 FOR UPDATE SKIP LOCKED`)).rows;
    for(const job of jobs)await db.query("UPDATE native_push_jobs SET status='sending',attempts=attempts+1,next_attempt=DATE_ADD(NOW(3),INTERVAL 20 SECOND) WHERE id=$1",[job.id]);await db.query('COMMIT');
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
   await Promise.all(jobs.map(async job=>{try{const data=typeof job.payload==='string'?JSON.parse(job.payload):job.payload;if(Number(data.expiresAt)<=Date.now()){await pool.query("UPDATE native_push_jobs SET status='expired' WHERE id=$1",[job.id]);return;}await sendFcm(job.token,data);await pool.query("UPDATE native_push_jobs SET status='sent' WHERE id=$1",[job.id]);}catch(error){if(error.unregistered)await pool.query('DELETE FROM native_push_devices WHERE token=$1',[job.token]);else await pool.query("UPDATE native_push_jobs SET status=$2,next_attempt=DATE_ADD(NOW(3),INTERVAL 5 SECOND) WHERE id=$1",[job.id,Number(job.attempts)>=2?'failed':'pending']);}}));
   await pool.query("DELETE FROM native_push_jobs WHERE expires_at<DATE_SUB(NOW(3),INTERVAL 1 DAY)");
  }catch(e){console.error('Native push worker pending',e.name);}
  if(!stopped){timer=setTimeout(tick,1000);timer.unref?.();}
 }
 if(process.env.NATIVE_PUSH_SERVICE_ACCOUNT_FILE)void tick();return ()=>{stopped=true;clearTimeout(timer);};
}
