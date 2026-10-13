import {randomUUID,randomInt,createHmac,timingSafeEqual} from 'node:crypto';
const flags=['sms_to_email','sms_to_chat','prefer_online_sip','receive_number_sip_calls'];
export const routingDefaults=Object.freeze({sms_to_email:false,sms_to_chat:false,prefer_online_sip:true,receive_number_sip_calls:false});
const truth=v=>v===true||v===1;
export function routingEnabled(){return process.env.SUBSCRIBER_ROUTING_ENABLED==='true';}
export function canonicalNumber(value){if(typeof value!=='string')return null;const n=value.replace(/[ ().-]/g,'');return /^\+[1-9][0-9]{7,14}$/.test(n)?n:null;}
export function validateRouting(value){if(!value||Array.isArray(value)||Object.keys(value).some(k=>!flags.includes(k))||flags.some(k=>typeof value[k]!=='boolean'))throw Error('Four boolean routing controls required');return Object.fromEntries(flags.map(k=>[k,value[k]]));}
export async function routingPreferences(pool,id){const row=(await pool.query('SELECT sms_to_email,sms_to_chat,prefer_online_sip,receive_number_sip_calls FROM subscriber_routing_preferences WHERE user_id=$1',[id])).rows[0];return Object.fromEntries(flags.map(k=>[k,row?truth(row[k]):routingDefaults[k]]));}
export async function migrateSubscriberRouting(pool){
 const column=await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='flowroute_sms_outbound' AND column_name='forwarding_pending'");
 if(!column.rowCount)await pool.query("ALTER TABLE flowroute_sms_outbound ADD COLUMN forwarding_pending BOOLEAN NOT NULL DEFAULT FALSE");
 await pool.query(`CREATE TABLE IF NOT EXISTS subscriber_routing_preferences(user_id CHAR(36) PRIMARY KEY,sms_to_email BOOLEAN NOT NULL DEFAULT FALSE,sms_to_chat BOOLEAN NOT NULL DEFAULT FALSE,prefer_online_sip BOOLEAN NOT NULL DEFAULT TRUE,receive_number_sip_calls BOOLEAN NOT NULL DEFAULT FALSE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
 await pool.query('INSERT IGNORE INTO subscriber_routing_preferences(user_id,sms_to_chat,receive_number_sip_calls) SELECT user_id,sms_chat,number_calls FROM subscriber_delivery_preferences');
 await pool.query(`CREATE TABLE IF NOT EXISTS subscriber_email_verification(user_id CHAR(36) PRIMARY KEY,email VARCHAR(254) NOT NULL,code_hash CHAR(64) NULL,expires_at DATETIME(3) NULL,attempts INT NOT NULL DEFAULT 0,verified_at DATETIME(3) NULL,sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS subscriber_delivery_jobs(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,recipient_id CHAR(36) NOT NULL,sender_id CHAR(36) NULL,event_key VARCHAR(180) NOT NULL,channel VARCHAR(8) NOT NULL,sender_number VARCHAR(16) NOT NULL,body TEXT NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'pending',attempts INT NOT NULL DEFAULT 0,next_attempt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),claimed_at DATETIME(3) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(recipient_id) REFERENCES users(id),UNIQUE KEY subscriber_delivery_once(tenant_id,recipient_id,event_key,channel),INDEX subscriber_delivery_pending(status,next_attempt)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS subscriber_sms_chat(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,recipient_id CHAR(36) NOT NULL,sender_number VARCHAR(16) NOT NULL,body TEXT NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(recipient_id) REFERENCES users(id),INDEX subscriber_sms_inbox(tenant_id,recipient_id,created_at)) ENGINE=InnoDB`);
}
export async function numberSubscriber(pool,tenantId,number){
 const normalized=canonicalNumber(number);if(!normalized)return null;
 const found=await pool.query(`SELECT DISTINCT assigned.user_id,a.username,a.domain,u.email FROM (
 SELECT user_id FROM flowroute_sms_numbers WHERE tenant_id=$1 AND number_e164=$2 AND enabled=TRUE
 UNION SELECT user_id FROM inhouse_dids WHERE tenant_id=$1 AND number_e164=$2 AND status='assigned' AND user_id IS NOT NULL
 ) assigned JOIN users u ON u.id=assigned.user_id AND u.tenant_id=$1 AND u.status='active'
 JOIN tenants t ON t.id=u.tenant_id AND t.status='active'
 JOIN sip_accounts a ON a.user_id=u.id AND a.tenant_id=u.tenant_id AND a.status='active' LIMIT 2`,[tenantId,normalized]);
 return found.rows.length===1&&/^[a-z0-9+_.-]{1,64}$/i.test(found.rows[0].username||'')&&/^[a-z0-9.-]{1,253}$/i.test(found.rows[0].domain||'')?found.rows[0]:null;
}
export function liveContact(result){
 if(!result||typeof result!=='object')return false;
 if(Array.isArray(result))return result.some(liveContact);
 if(typeof result.Address==='string'&&/^sips?:/i.test(result.Address)&&Number(result.Expires)>0)return true;
 return Object.values(result).some(v=>v&&typeof v==='object'&&liveContact(v));
}
export async function registeredSubscriber(username,domain,fetcher=fetch){
 const raw=process.env.KAMAILIO_LOCATION_RPC_URL;if(!raw)return false;
 let url;try{url=new URL(raw);}catch{return false;}
 if(url.username||url.password||!['https:','http:'].includes(url.protocol))return false;
 // HTTP is allowed only for loopback/private switch hosts; never publish a general RPC endpoint.
 if(url.protocol==='http:'&&!/^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|host\.docker\.internal)$/.test(url.hostname))return false;
 try{
  const headers={'Content-Type':'application/json'};if(process.env.KAMAILIO_LOCATION_RPC_TOKEN)headers.Authorization='Bearer '+process.env.KAMAILIO_LOCATION_RPC_TOKEN;
  const response=await fetcher(url,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'ul.lookup',params:['location',`${username}@${domain}`]}),signal:AbortSignal.timeout(1500)});
  if(!response.ok)return false;const text=await response.text();if(Buffer.byteLength(text)>65536)return false;const data=JSON.parse(text);return !data.error&&liveContact(data.result);
 }catch{return false;}
}
export async function onlineNumberTarget(pool,user,number,probe=registeredSubscriber){
 if(!routingEnabled()||!canonicalNumber(number))return null;
 if(!(await routingPreferences(pool,user.id)).prefer_online_sip)return null;
 const subscriber=await numberSubscriber(pool,user.tenant_id,number);if(!subscriber||subscriber.user_id===user.id)return null;
 if(!(await routingPreferences(pool,subscriber.user_id)).receive_number_sip_calls)return null;
 const presence=(await pool.query('SELECT presence FROM user_presence WHERE user_id=$1',[subscriber.user_id])).rows[0];
 if(presence?.presence==='dnd'||presence?.presence==='invisible')return null;
 const blocked=await pool.query(`SELECT 1 FROM conversation_preferences WHERE blocked=TRUE AND ((owner_id=$1 AND contact_id=$2) OR (owner_id=$2 AND contact_id=$1))`,[user.id,subscriber.user_id]);
 if(blocked.rowCount||!await probe(subscriber.username,subscriber.domain))return null;
 return `sip:${subscriber.username}@${subscriber.domain}`;
}
export async function queueSubscriberSms(pool,{tenantId,number,senderNumber,body,eventKey,senderId=null}){
 if(!routingEnabled()||typeof body!=='string'||!body.trim()||body.length>4000||typeof eventKey!=='string'||eventKey.length>180||!canonicalNumber(senderNumber))return false;
 const recipient=await numberSubscriber(pool,tenantId,number);if(!recipient)return false;
 const preferences=await routingPreferences(pool,recipient.user_id);
 for(const channel of ['email','chat']){
  if(!preferences[channel==='email'?'sms_to_email':'sms_to_chat'])continue;
  await pool.query(`INSERT IGNORE INTO subscriber_delivery_jobs(id,tenant_id,recipient_id,sender_id,event_key,channel,sender_number,body) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),tenantId,recipient.user_id,senderId,eventKey,channel,senderNumber,body]);
 }
 return true;
}
const mailReady=()=>!!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM);
async function sendEmail({to,subject,text,key},fetcher=fetch){
 if(!mailReady())throw Error('Email transport unavailable');
 const endpoint=process.env.NODE_ENV==='test'&&/^http:\/\/127\.0\.0\.1:\d+\/emails$/.test(process.env.RESEND_API_URL||'')?process.env.RESEND_API_URL:'https://api.resend.com/emails';
 const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:process.env.RESEND_FROM,to:[to],subject,text}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Email provider rejected delivery');
}
const codeHash=(id,email,code)=>createHmac('sha256',process.env.OTP_HMAC_SECRET).update(`${id}:${email}:${code}`).digest('hex');
export async function handleSubscriberRouting({req,res,path,user,pool,send,readJson}){
 if(path==='/api/account/subscriber-routing'){
  if(req.method==='GET'){
   const verified=(await pool.query('SELECT 1 FROM subscriber_email_verification WHERE user_id=$1 AND email=$2 AND verified_at IS NOT NULL',[user.id,user.email])).rowCount>0;
   return send(res,200,{...await routingPreferences(pool,user.id),enabled:routingEnabled(),emailVerified:verified,emailConfigured:mailReady(),callPresenceConfigured:!!process.env.KAMAILIO_LOCATION_RPC_URL});
  }
  if(req.method==='PUT'){
   let value;try{value=validateRouting(await readJson(req));}catch(error){return send(res,400,{error:error.message});}
   if((value.sms_to_email||value.sms_to_chat)&&!user.features?.messaging)return send(res,403,{error:'Messaging access required'});
   if(value.sms_to_email&&!(await pool.query('SELECT 1 FROM subscriber_email_verification WHERE user_id=$1 AND email=$2 AND verified_at IS NOT NULL',[user.id,user.email])).rowCount)return send(res,400,{error:'Verify your profile email before enabling SMS email forwarding'});
   await pool.query(`INSERT INTO subscriber_routing_preferences(user_id,sms_to_email,sms_to_chat,prefer_online_sip,receive_number_sip_calls) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE sms_to_email=VALUES(sms_to_email),sms_to_chat=VALUES(sms_to_chat),prefer_online_sip=VALUES(prefer_online_sip),receive_number_sip_calls=VALUES(receive_number_sip_calls)`,[user.id,...flags.map(k=>value[k])]);return send(res,200,value);
  }
 }
 if(path==='/api/account/subscriber-routing/email-code'&&req.method==='POST'){
  if(!mailReady()||process.env.OTP_HMAC_SECRET?.length<32||!process.env.OTP_HMAC_SECRET)return send(res,503,{error:'Email verification delivery is not configured'});
  const id=randomUUID(),code=String(randomInt(100000,1000000));
  const db=await pool.connect();try{
   await db.query('BEGIN');await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
   const recent=(await db.query('SELECT 1 FROM subscriber_email_verification WHERE user_id=$1 AND sent_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 MINUTE)',[user.id])).rowCount;
   if(recent){await db.query('ROLLBACK');return send(res,429,{error:'Wait one minute before requesting another code'});}
   await db.query(`INSERT INTO subscriber_email_verification(user_id,email,code_hash,expires_at) VALUES($1,$2,$3,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE)) ON DUPLICATE KEY UPDATE email=VALUES(email),code_hash=VALUES(code_hash),expires_at=VALUES(expires_at),attempts=0,verified_at=NULL,sent_at=UTC_TIMESTAMP(3)`,[user.id,user.email,codeHash(user.id,user.email,code)]);await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  try{await sendEmail({to:user.email,subject:'Verify Olamide SMS forwarding',text:`Your verification code is ${code}. It expires in 10 minutes.`,key:`sms-verify/${id}`});return send(res,200,{status:'verification_sent'});}catch{return send(res,503,{error:'Verification email could not be accepted; try again later'});}
 }
 if(path==='/api/account/subscriber-routing/verify-email'&&req.method==='POST'){
  if(!process.env.OTP_HMAC_SECRET||process.env.OTP_HMAC_SECRET.length<32)return send(res,503,{error:'Email verification is not configured'});
  const {code}=await readJson(req);if(typeof code!=='string'||!/^\d{6}$/.test(code))return send(res,400,{error:'Six-digit code required'});
  const db=await pool.connect();try{
   await db.query('BEGIN');const row=(await db.query('SELECT code_hash,attempts,expires_at,email FROM subscriber_email_verification WHERE user_id=$1 FOR UPDATE',[user.id])).rows[0];
   const valid=row?.email===user.email&&row.attempts<5&&row.code_hash&&new Date(row.expires_at).getTime()>Date.now()&&timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(codeHash(user.id,user.email,code),'hex'));
   if(valid)await db.query('UPDATE subscriber_email_verification SET verified_at=UTC_TIMESTAMP(3),code_hash=NULL WHERE user_id=$1',[user.id]);
   else await db.query('UPDATE subscriber_email_verification SET attempts=attempts+1 WHERE user_id=$1',[user.id]);
   await db.query('COMMIT');return send(res,valid?200:400,valid?{status:'verified'}:{error:'Invalid or expired code'});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 if(path==='/api/account/subscriber-routing/sms-chat'&&req.method==='GET'){
  if(!user.features?.messaging)return send(res,403,{error:'Messaging access required'});
  const rows=await pool.query('SELECT id,sender_number,body,created_at FROM subscriber_sms_chat WHERE tenant_id=$1 AND recipient_id=$2 ORDER BY created_at DESC LIMIT 100',[user.tenant_id,user.id]);return send(res,200,{messages:rows.rows});
 }
 return send(res,405,{error:'Routing action unavailable'});
}
export async function deliverSubscriberJob(pool,job,{mail=sendEmail}={}){
 const recipient=(await pool.query('SELECT u.email,u.role FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=$1 AND u.tenant_id=$2 AND u.status=\'active\' AND t.status=\'active\'',[job.recipient_id,job.tenant_id])).rows[0];if(!recipient)return 'cancelled';
 if(!['admin','super_admin'].includes(recipient.role)){const groups=await pool.query('SELECT g.features FROM user_group_members m JOIN user_groups g ON g.id=m.group_id WHERE m.user_id=$1 AND g.tenant_id=$2',[job.recipient_id,job.tenant_id]);if(!groups.rows.some(r=>(typeof r.features==='string'?JSON.parse(r.features):r.features)?.messaging===true))return 'cancelled';}
 const preferences=await routingPreferences(pool,job.recipient_id);if(!preferences[job.channel==='email'?'sms_to_email':'sms_to_chat'])return 'cancelled';
 if(job.sender_id){const blocked=await pool.query('SELECT 1 FROM conversation_preferences WHERE blocked=TRUE AND ((owner_id=$1 AND contact_id=$2) OR (owner_id=$2 AND contact_id=$1))',[job.sender_id,job.recipient_id]);if(blocked.rowCount)return 'cancelled';}
 if(job.channel==='email'){
  if(!(await pool.query('SELECT 1 FROM subscriber_email_verification WHERE user_id=$1 AND email=$2 AND verified_at IS NOT NULL',[job.recipient_id,recipient.email])).rowCount)return 'cancelled';
  await mail({to:recipient.email,subject:`SMS from ${job.sender_number}`,text:job.body,key:`sms-forward/${job.id}`});return 'sent';
 }
 if(job.channel!=='chat')return 'cancelled';
 const db=await pool.connect();try{
  await db.query('BEGIN');
  if(job.sender_id&&job.sender_id!==job.recipient_id){
   const sender=await db.query('SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2 AND status=\'active\'',[job.sender_id,job.tenant_id]);
   if(sender.rowCount){await db.query('INSERT IGNORE INTO contacts(owner_id,contact_id) VALUES($1,$2),($2,$1)',[job.sender_id,job.recipient_id]);await db.query('INSERT IGNORE INTO messages(id,sender_id,recipient_id,body) VALUES($1,$2,$3,$4)',[job.id,job.sender_id,job.recipient_id,`[SMS from ${job.sender_number}]\n${job.body}`.slice(0,4000)]);await db.query('COMMIT');return 'sent';}
  }
  await db.query('INSERT IGNORE INTO subscriber_sms_chat(id,tenant_id,recipient_id,sender_number,body) VALUES($1,$2,$3,$4,$5)',[job.id,job.tenant_id,job.recipient_id,job.sender_number,job.body]);await db.query('COMMIT');return 'sent';
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export function startSubscriberDelivery(pool){
 let busy=false,stopped=false;
 async function tick(){if(busy||stopped||!routingEnabled())return;busy=true;try{
  // Reconcile carrier-accepted outbound SMS after a queue write failure. Idempotent event/channel keys prevent duplicates.
  const accepted=await pool.query("SELECT tenant_id,user_id,sender,recipient,body,provider_event_id FROM flowroute_sms_outbound WHERE status='accepted' AND forwarding_pending=TRUE AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 23 HOUR) ORDER BY created_at DESC LIMIT 1000");
  for(const row of accepted.rows){await queueSubscriberSms(pool,{tenantId:row.tenant_id,number:row.recipient,senderNumber:row.sender,body:row.body,eventKey:`flowroute/${row.provider_event_id}`,senderId:row.user_id});await pool.query("UPDATE flowroute_sms_outbound SET forwarding_pending=FALSE WHERE tenant_id=$1 AND provider_event_id=$2",[row.tenant_id,row.provider_event_id]);}
  // Leases recover crashed workers. All email retries use the same provider idempotency key within 24 hours.
  await pool.query("UPDATE subscriber_delivery_jobs SET status='pending' WHERE status='processing' AND claimed_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE)");
  await pool.query("UPDATE subscriber_delivery_jobs SET status='expired' WHERE status='pending' AND created_at<DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 23 HOUR)");
  const db=await pool.connect();let jobs=[];try{await db.query('BEGIN');jobs=(await db.query("SELECT * FROM subscriber_delivery_jobs WHERE status='pending' AND attempts<8 AND next_attempt<=UTC_TIMESTAMP(3) ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED")).rows;for(const job of jobs)await db.query("UPDATE subscriber_delivery_jobs SET status='processing',attempts=attempts+1,claimed_at=UTC_TIMESTAMP(3) WHERE id=$1",[job.id]);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  for(const job of jobs){try{const status=await deliverSubscriberJob(pool,job);await pool.query('UPDATE subscriber_delivery_jobs SET status=$1 WHERE id=$2',[status,job.id]);}catch{await pool.query("UPDATE subscriber_delivery_jobs SET status=$1,next_attempt=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL $2 SECOND) WHERE id=$3",[Number(job.attempts)>=7?'failed':'pending',Math.min(3600,30*2**Number(job.attempts)),job.id]);}}
 }catch{console.warn('Subscriber delivery worker unavailable; pending jobs retained');}finally{busy=false;}}
 const timer=setInterval(tick,5000);timer.unref();return()=>{stopped=true;clearInterval(timer);};
}
