import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const pushHosts=new Set(['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com']);
export function validateWebSubscription(input) {
  if(!input || typeof input!=='object')throw Error('Push subscription required');
  const endpoint=new URL(input.endpoint);
  if(endpoint.protocol!=='https:' || !pushHosts.has(endpoint.hostname) || endpoint.port || endpoint.username || endpoint.password || endpoint.hash || endpoint.href.length>2048)
    throw Error('Unsupported browser push endpoint');
  const {p256dh,auth}=input.keys||{};
  if(typeof p256dh!=='string'||!/^[A-Za-z0-9_-]{87}$/.test(p256dh)||Buffer.from(p256dh,'base64url').length!==65 || Buffer.from(p256dh,'base64url')[0]!==4 || typeof auth!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(auth)||Buffer.from(auth,'base64url').length!==16)
    throw Error('Valid browser push keys required');
  return {endpoint:endpoint.href,keys:{p256dh,auth}};
}
export async function webPushConfig() {
  const path=process.env.WEB_PUSH_CONFIG_FILE;
  if(!path)return null;
  const config=JSON.parse(await readFile(path,'utf8'));
  if(!/^[A-Za-z0-9_-]{87}$/.test(config.publicKey||'')||!/^[A-Za-z0-9_-]{43}$/.test(config.privateKey||'')||!/^mailto:[^\s@]+@[^\s@]+$/.test(config.subject||''))throw Error('Invalid Web Push configuration');
  return config;
}
export async function handleWebPushDevice({req,res,path,user,pool,send,readJson,sessionHash}) {
  if(path==='/api/native-push/web-config'&&req.method==='GET') {
    const config=await webPushConfig();
    return send(res,200,{configured:!!config,publicKey:config?.publicKey||null});
  }
  if(path!=='/api/native-push/web-device'||!['POST','DELETE'].includes(req.method))return send(res,405,{error:'Push operation unavailable'});
  let subscription;
  try{subscription=validateWebSubscription(await readJson(req,8192));}
  catch{return send(res,400,{error:'Valid supported browser subscription required'});}
  const token=JSON.stringify(subscription),id=createHash('sha256').update(subscription.endpoint).digest('hex');
  if(req.method==='DELETE')await pool.query('DELETE FROM native_push_devices WHERE id=$1 AND user_id=$2',[id,user.id]);
  else {
    if(!await webPushConfig())return send(res,503,{error:'Browser notifications are not configured'});
    await pool.query(`INSERT INTO native_push_devices(id,user_id,tenant_id,token,session_hash,platform,expires_at) VALUES($1,$2,$3,$4,$5,'web',DATE_ADD(NOW(3),INTERVAL 30 DAY))
      ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),tenant_id=VALUES(tenant_id),token=VALUES(token),session_hash=VALUES(session_hash),platform='web',expires_at=VALUES(expires_at)`,[id,user.id,user.tenant_id,token,sessionHash]);
  }
  return send(res,200,{status:req.method==='DELETE'?'removed':'registered'});
}
export async function sendBrowserPush(token,data,{loadSender=()=>import('web-push'),config=webPushConfig}={}) {
  const subscription=validateWebSubscription(JSON.parse(token));
  const settings=await config();
  if(!settings)throw Error('Browser push is not configured');
  const sender=await loadSender();
  try {
    await (sender.default||sender).sendNotification(subscription,JSON.stringify(data),{
      TTL:45,urgency:'high',timeout:8000,
      vapidDetails:{subject:settings.subject,publicKey:settings.publicKey,privateKey:settings.privateKey}
    });
  } catch(error) {
    error.unregistered=error.statusCode===404||error.statusCode===410;
    throw error;
  }
}
