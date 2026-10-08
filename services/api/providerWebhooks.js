import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug=/^[a-z][a-z0-9-]{1,39}$/;
const token=()=>randomBytes(32).toString('hex');
const digest=value=>createHash('sha256').update(value).digest();
export async function migrateProviderWebhooks(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS provider_webhooks (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,provider VARCHAR(40) NOT NULL,
    display_name VARCHAR(100) NOT NULL,enabled BOOLEAN NOT NULL DEFAULT FALSE,
    token_hash BINARY(32) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),UNIQUE KEY provider_webhook_unique(tenant_id,provider)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS provider_webhook_events (
    id CHAR(36) PRIMARY KEY,webhook_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,
    payload_hash BINARY(32) NOT NULL,content_type VARCHAR(100) NOT NULL,
    received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(webhook_id) REFERENCES provider_webhooks(id) ON DELETE CASCADE,
    INDEX provider_webhook_recent(webhook_id,received_at)
  ) ENGINE=InnoDB`);
}
export async function handleProviderWebhook({req,res,path,pool,send}){
  if(req.method!=='POST')return send(res,405,{error:'POST required'});
  const match=/^\/api\/webhooks\/providers\/([0-9a-f-]{36})\/([a-z][a-z0-9-]{1,39})\/([0-9a-f]{64})$/.exec(path);
  if(!match||!uuid.test(match[1]))return send(res,404,{error:'Webhook unavailable'});
  const record=(await pool.query('SELECT id,token_hash FROM provider_webhooks WHERE tenant_id=$1 AND provider=$2 AND enabled=TRUE',[match[1],match[2]])).rows[0];
  if(!record||!timingSafeEqual(Buffer.from(record.token_hash),digest(match[3])))return send(res,404,{error:'Webhook unavailable'});
  if(!/^application\/(json|vnd\.api\+json)(?:\s*;|\s*$)/i.test(req.headers['content-type']||''))return send(res,415,{error:'JSON required'});
  const chunks=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>1024*1024)return send(res,413,{error:'Webhook too large'});chunks.push(chunk);}
  const raw=Buffer.concat(chunks);try{JSON.parse(raw.toString('utf8'));}catch{return send(res,400,{error:'Invalid JSON'});}
  await pool.query('INSERT INTO provider_webhook_events(id,webhook_id,tenant_id,payload_hash,content_type) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(),record.id,match[1],digest(raw),req.headers['content-type'].slice(0,100)]);
  return send(res,202,{received:true,note:'Recorded for review; provider-specific delivery processing is not enabled.'});
}
export async function handleProviderWebhookAdmin({req,res,path,user,pool,send,readJson,origin}){
  if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  const tenant=user.tenant_id;
  if(path==='/api/admin/provider-webhooks'&&req.method==='GET'){
    const [rows,events]=await Promise.all([
      pool.query('SELECT id,provider,display_name,enabled,created_at FROM provider_webhooks WHERE tenant_id=$1 ORDER BY provider',[tenant]),
      pool.query('SELECT e.id,w.provider,e.content_type,e.received_at,HEX(e.payload_hash) AS payload_hash FROM provider_webhook_events e JOIN provider_webhooks w ON w.id=e.webhook_id WHERE e.tenant_id=$1 ORDER BY e.received_at DESC LIMIT 50',[tenant])]);
    return send(res,200,{tenantId:tenant,webhooks:rows.rows,events:events.rows,
      flowroute:{sms:`${origin}/api/webhooks/flowroute/.../sms`,note:'Existing Flowroute messaging callback settings are managed separately. Secret URL is deliberately hidden here.'}});
  }
  if(path==='/api/admin/provider-webhooks'&&req.method==='POST'){
    const {provider,displayName}=await readJson(req);
    if(!slug.test(provider||'')||provider==='flowroute'||provider==='stripe'||typeof displayName!=='string'||!displayName.trim()||displayName.length>100)
      return send(res,400,{error:'Valid provider slug and display name required'});
    const secret=token(),id=randomUUID();
    try{await pool.query('INSERT INTO provider_webhooks(id,tenant_id,provider,display_name,token_hash) VALUES($1,$2,$3,$4,$5)',[id,tenant,provider,displayName.trim(),digest(secret)]);}
    catch(error){if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Provider already exists'});throw error;}
    return send(res,201,{id,provider,enabled:false,url:`${origin}/api/webhooks/providers/${tenant}/${provider}/${secret}`});
  }
  const match=/^\/api\/admin\/provider-webhooks\/([0-9a-f-]{36})\/(status|rotate)$/.exec(path);
  if(match&&req.method==='PUT'){
    if(!uuid.test(match[1]))return send(res,400,{error:'Invalid webhook'});
    const exists=await pool.query('SELECT provider FROM provider_webhooks WHERE id=$1 AND tenant_id=$2',[match[1],tenant]);
    if(!exists.rowCount)return send(res,404,{error:'Webhook unavailable'});
    if(match[2]==='status'){
      const {enabled}=await readJson(req);if(typeof enabled!=='boolean')return send(res,400,{error:'Boolean enabled required'});
      await pool.query('UPDATE provider_webhooks SET enabled=$1 WHERE id=$2 AND tenant_id=$3',[enabled,match[1],tenant]);
      return send(res,200,{enabled});
    }
    const secret=token();await pool.query('UPDATE provider_webhooks SET token_hash=$1 WHERE id=$2 AND tenant_id=$3',[digest(secret),match[1],tenant]);
    return send(res,200,{url:`${origin}/api/webhooks/providers/${tenant}/${exists.rows[0].provider}/${secret}`});
  }
  if(path==='/api/admin/provider-webhooks/catalog'&&req.method==='GET')return send(res,200,{suggestions:['didww','twilio','vonage','telnyx','bandwidth']});
  return send(res,404,{error:'Webhook route unavailable'});
}
