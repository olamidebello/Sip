import {randomUUID,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const methods={
  balance:['GET'],cities:['GET'],countries:['GET'],dids:['GET','PATCH'],
  did_history:['GET'],did_groups:['GET'],did_group_types:['GET'],
  capacity_pools:['GET','PATCH'],shared_capacity_groups:['GET','POST','PATCH','DELETE'],
  exports:['GET','POST','PATCH'],orders:['GET','POST','PATCH','DELETE'],
  regions:['GET'],voice_in_trunks:['GET','POST','PATCH','DELETE'],
  voice_out_trunks:['GET','POST','PATCH','DELETE'],
  emergency_calling_services:['GET','DELETE'],
  voice_in_trunk_groups:['GET','POST','PATCH','DELETE'],
  available_dids:['GET'],did_reservations:['GET','POST','DELETE'],
  address_verifications:['GET','POST','PATCH'],
  emergency_verifications:['GET','POST','PATCH'],
  addresses:['GET','POST','PATCH','DELETE'],
  encrypted_files:['GET','POST','DELETE'],identities:['GET','POST','PATCH','DELETE'],
  permanent_supporting_documents:['GET','POST','PATCH','DELETE'],
  proof_types:['GET'],proofs:['GET','POST','DELETE'],
  address_requirements:['GET'],emergency_requirements:['GET'],
  emergency_requirement_validations:['POST']
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash=value=>createHash('sha256').update(value).digest();
const base=()=>process.env.DIDWW_API_ENV==='sandbox'?'https://sandbox-api.didww.com/v3':
  process.env.DIDWW_API_ENV==='production'?'https://api.didww.com/v3':null;
const bound=tenant=>!!process.env.DIDWW_TENANT_ID&&process.env.DIDWW_TENANT_ID===tenant;
const callbackUrl=(origin,tenant)=>`${origin}/api/webhooks/didww/${tenant}`;

export async function migrateDidwwIntegration(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS didww_api_audit (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,
    resource VARCHAR(48) NOT NULL,method VARCHAR(8) NOT NULL,resource_id CHAR(36) NULL,
    request_hash BINARY(32) NULL,response_status SMALLINT UNSIGNED NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(actor_id) REFERENCES users(id),
    INDEX didww_api_audit_recent(tenant_id,created_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS didww_callback_events (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,resource_type VARCHAR(48) NOT NULL,
    resource_id VARCHAR(100) NOT NULL,event_status VARCHAR(32) NOT NULL,
    payload_hash BINARY(32) NOT NULL,received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),UNIQUE KEY didww_event_dedupe(tenant_id,payload_hash),
    INDEX didww_event_recent(tenant_id,received_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS didww_call_events (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,call_ref VARCHAR(100) NOT NULL,
    event_type VARCHAR(64) NOT NULL,payload_hash BINARY(32) NOT NULL,
    received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),
    UNIQUE KEY didww_call_event_dedupe(tenant_id,payload_hash),
    INDEX didww_call_event_recent(tenant_id,received_at)
  ) ENGINE=InnoDB`);
}

export function didwwSignature(url,payload,secret){
  const parsed=new URL(url);
  const port=parsed.port|| (parsed.protocol==='https:'?'443':'80');
  const normalized=`${parsed.protocol}//${parsed.hostname}:${port}${parsed.pathname}${parsed.search}`;
  const data=Array.isArray(payload)?payload.map(item=>Object.keys(item).sort().map(key=>key+String(item[key])).join('')).join(''):
    Object.keys(payload).sort().map(key=>key+String(payload[key])).join('');
  return createHmac('sha1',secret).update(normalized+data).digest('hex');
}
export function validDidwwSignature(url,payload,secret,signature){
  if(!secret||typeof signature!=='string'||!/^[0-9a-f]{40}$/i.test(signature))return false;
  const expected=Buffer.from(didwwSignature(url,payload,secret),'hex');
  return timingSafeEqual(expected,Buffer.from(signature,'hex'));
}

export async function handleDidwwCallback({req,res,path,pool,send,origin}){
  const callMatch=/^\/api\/webhooks\/didww\/([0-9a-f-]{36})\/call-events$/.exec(path);
  if(callMatch){
    if(!uuid.test(callMatch[1])||!bound(callMatch[1]))return send(res,404,{error:'Callback unavailable'});
    if(req.method!=='POST')return send(res,405,{error:'POST required'});
    const expected=process.env.DIDWW_CALL_EVENTS_TOKEN;
    const supplied=req.headers['x-auth-token'];
    if(!expected||typeof supplied!=='string'||!timingSafeEqual(hash(expected),hash(supplied)))
      return send(res,401,{error:'Invalid event token'});
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>1048576)return send(res,413,{error:'Event too large'});chunks.push(chunk);}
    let raw=Buffer.concat(chunks);
    try{
      if(req.headers['content-encoding']==='gzip')raw=gunzipSync(raw,{maxOutputLength:1048576});
      else if(req.headers['content-encoding'])return send(res,415,{error:'Unsupported encoding'});
      if(!/^(?:application\/(?:vnd\.api\+json|json)|text\/plain)/i.test(req.headers['content-type']||''))
        return send(res,415,{error:'JSON required'});
      const payload=JSON.parse(raw.toString('utf8'));
      const events=Array.isArray(payload)?payload:[payload];
      if(!events.length||events.length>100||events.some(event=>!event||typeof event.type!=='string'||
        typeof event.id!=='string'||!/^(?:(?:incoming|outbound)-call-(?:start|connect|end)-event|(?:inbound|outbound)-cdr)$/.test(event.type)))
        return send(res,400,{error:'Invalid call event'});
      for(const event of events)await pool.query('INSERT IGNORE INTO didww_call_events(id,tenant_id,call_ref,event_type,payload_hash) VALUES($1,$2,$3,$4,$5)',
        [randomUUID(),callMatch[1],event.id.slice(0,100),event.type.slice(0,64),hash(JSON.stringify(event))]);
      return send(res,202,{received:true,count:events.length});
    }catch{return send(res,400,{error:'Invalid call event'});}
  }
  const match=/^\/api\/webhooks\/didww\/([0-9a-f-]{36})$/.exec(path);
  if(!match||!uuid.test(match[1])||!bound(match[1]))return send(res,404,{error:'Callback unavailable'});
  if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Method unavailable'});
  const configured=callbackUrl(origin,match[1]);
  let payload,raw='';
  if(req.method==='GET'){
    const url=new URL(req.url,origin);
    payload=Object.fromEntries([...url.searchParams.entries()]);
  }else{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>65536)return send(res,413,{error:'Callback too large'});chunks.push(chunk);}
    raw=Buffer.concat(chunks).toString('utf8');
    const type=(req.headers['content-type']||'').split(';')[0].toLowerCase();
    try{
      if(type==='application/x-www-form-urlencoded')payload=Object.fromEntries(new URLSearchParams(raw));
      else if(type==='application/json')payload=JSON.parse(raw);
      else return send(res,415,{error:'Unsupported callback content type'});
    }catch{return send(res,400,{error:'Invalid callback'});}
  }
  const url=configured;
  if(!validDidwwSignature(url,payload,process.env.DIDWW_CALLBACK_SECRET,req.headers['x-didww-signature']))
    return send(res,401,{error:'Invalid callback signature'});
  const events=Array.isArray(payload)?payload:[payload];
  if(!events.length||events.length>100||events.some(item=>!item||typeof item!=='object'||
    typeof item.type!=='string'||typeof item.id!=='string'||typeof item.status!=='string'))
    return send(res,400,{error:'Invalid event payload'});
  for(const item of events){
    const digest=hash(JSON.stringify(item));
    await pool.query('INSERT IGNORE INTO didww_callback_events(id,tenant_id,resource_type,resource_id,event_status,payload_hash) VALUES($1,$2,$3,$4,$5,$6)',
      [randomUUID(),match[1],item.type.slice(0,48),item.id.slice(0,100),item.status.slice(0,32),digest]);
  }
  return send(res,202,{received:true});
}

export async function handleDidwwAdmin({req,res,path,user,pool,send,readJson,origin}){
  if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  if(!bound(user.tenant_id))return send(res,409,{error:'DIDWW tenant binding is not configured for this tenant'});
  if(!base())return send(res,409,{error:'Set DIDWW_API_ENV to sandbox or production'});
  if(path==='/api/admin/didww/config'&&req.method==='GET')
    return send(res,200,{environment:process.env.DIDWW_API_ENV,
      apiConfigured:!!process.env.DIDWW_API_KEY,callbackConfigured:!!process.env.DIDWW_CALLBACK_SECRET,
      callbackUrl:callbackUrl(origin,user.tenant_id),
      callEventsConfigured:!!process.env.DIDWW_CALL_EVENTS_TOKEN,
      callEventsUrl:`${callbackUrl(origin,user.tenant_id)}/call-events`,resources:methods});
  if(path==='/api/admin/didww/events'&&req.method==='GET'){
    const [callbacks,calls]=await Promise.all([
      pool.query('SELECT id,resource_type,resource_id,event_status,received_at FROM didww_callback_events WHERE tenant_id=$1 ORDER BY received_at DESC LIMIT 100',[user.tenant_id]),
      pool.query('SELECT id,call_ref,event_type,received_at FROM didww_call_events WHERE tenant_id=$1 ORDER BY received_at DESC LIMIT 100',[user.tenant_id])]);
    return send(res,200,{events:callbacks.rows,callEvents:calls.rows});
  }
  const match=/^\/api\/admin\/didww\/resources\/([a-z_]+)(?:\/([0-9a-f-]{36}))?$/.exec(path);
  if(!match||!methods[match[1]]?.includes(req.method)||match[2]&&!uuid.test(match[2]))
    return send(res,404,{error:'DIDWW resource or method unavailable'});
  if(!process.env.DIDWW_API_KEY)return send(res,409,{error:'DIDWW API key is not configured'});
  const [,resource,id]=match;
  if(['PATCH','DELETE'].includes(req.method)&&!id)return send(res,400,{error:'Resource ID required'});
  if(req.method==='POST'&&id)return send(res,400,{error:'Create requests use the collection URL'});
  let body;
  if(['POST','PATCH'].includes(req.method)){
    body=await readJson(req,65536);
    if(!body?.data||body.data.type!==resource||Array.isArray(body.data)||
      (req.method==='PATCH'&&body.data.id!==id))
      return send(res,400,{error:'JSON:API data type and resource ID must match'});
  }
  const upstream=new URL(`${base()}/${resource}${id?'/'+id:''}`);
  if(req.method==='GET'){
    const incoming=new URL(req.url,origin);
    for(const [key,value] of incoming.searchParams){
      if(!/^(?:filter\[[a-z_]+\]|page\[(?:number|size)\]|include|sort)$/.test(key)||value.length>200)
        return send(res,400,{error:'Unsupported query parameter'});
      upstream.searchParams.append(key,value);
    }
  }
  const serialized=body===undefined?undefined:JSON.stringify(body);
  let response,payload;
  try{
    response=await fetch(upstream,{method:req.method,signal:AbortSignal.timeout(15000),
      headers:{'Api-Key':process.env.DIDWW_API_KEY,'Accept':'application/vnd.api+json',
        'Content-Type':'application/vnd.api+json','X-DIDWW-Api-Version':'2026-04-16'},
      body:serialized});
    const raw=await response.text();
    payload=raw?JSON.parse(raw):null;
  }catch{return send(res,502,{error:'DIDWW API unavailable'});}
  if(req.method!=='GET')
    await pool.query('INSERT INTO didww_api_audit(id,tenant_id,actor_id,resource,method,resource_id,request_hash,response_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(),user.tenant_id,user.id,resource,req.method,id||null,serialized?hash(serialized):null,response.status]);
  return send(res,response.ok?200:response.status,{upstreamStatus:response.status,data:payload});
}
