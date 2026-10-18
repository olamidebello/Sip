import {didInboundLookup} from './didIngress.js';
import {serviceLocationAccess} from './locationPolicy.js';
import http from 'node:http';
import {reservePstn,settlePstn} from './pstnBilling.js';
import {timingSafeEqual} from 'node:crypto';
export function bridgeAuthorized(header,token){
 if(!/^[0-9a-f]{64}$/.test(token||''))return false;
 const expected=Buffer.from(`Bearer ${token}`),actual=Buffer.from(header||'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function bridgeLookup(pool,path,data){
 if(path==='/api/switch/kamailio/location-check'){
  if(!Array.isArray(data.callKeys)||data.callKeys.length>32||data.callKeys.some(k=>!/^[a-f0-9]{64}$/.test(k)))return [400,{error:'Valid call keys required'}];
  const results=[],checks=new Map();
  const access=async(tenant,user,sessionHash,requireSession=false)=>{const key=tenant+":"+user+":"+(sessionHash||'')+":"+requireSession;if(!checks.has(key))checks.set(key,await serviceLocationAccess(pool,tenant,user,{sessionHash,requireSession}));return checks.get(key);};
  for(const key of data.callKeys){
   const c=(await pool.query('SELECT tenant_id,caller_id,caller_session_hash,callee_id FROM location_sip_calls WHERE call_key=$1',[key])).rows[0];
   if(!c)continue;
   const caller=await access(c.tenant_id,c.caller_id,c.caller_session_hash,true);
   const callee=c.callee_id?await access(c.tenant_id,c.callee_id):{allowed:true,restricted:false};
   results.push({callKey:key,allowed:caller.allowed&&callee.allowed,restricted:caller.restricted||callee.restricted});
  }
  return [200,{results}];
 }
 const identity=/^[a-zA-Z0-9]{2,64}$/;
 if(path==='/api/switch/kamailio/billing-event')return settlePstn(pool,data);

 if(path==='/api/switch/kamailio/did-inbound')return didInboundLookup(pool,data);
 if(typeof data.domain!=='string'||!/^[-a-zA-Z0-9.]{1,253}$/.test(data.domain))return [400,{error:'Invalid domain'}];
 if(path==='/api/switch/kamailio/auth'){
  if(!identity.test(data.username||''))return [400,{error:'Invalid username'}];
  const row=(await pool.query('SELECT ha1 FROM olamide_sip_auth WHERE username=$1 AND domain=$2',[data.username,data.domain])).rows[0];
  return row?[200,{ha1:row.ha1}]:[403,{error:'Account unavailable'}];
 }
 if(path==='/api/switch/kamailio/route'){
  if(String(data.destination||'').startsWith('+')&&(process.env.KAMAILIO_PSTN_ENABLED!=='true'||!data.callKey))return [403,{error:'Paid route not authorized'}];
  if(!identity.test(data.caller||'')||!(identity.test(data.destination||'')||/^\+?[1-9][0-9]{7,14}$/.test(data.destination||'')))return [403,{error:'Internal SIP identities required'}];
  const caller=(await pool.query("SELECT a.user_id,a.tenant_id FROM sip_accounts a JOIN users u ON u.id=a.user_id AND u.tenant_id=a.tenant_id AND u.status='active' WHERE a.username=$1 AND a.domain=$2 AND a.status='active'",[data.caller,data.domain])).rows[0];
  if(!caller)return [403,{error:'Account unavailable'}];
  const access=await serviceLocationAccess(pool,caller.tenant_id,caller.user_id,{proof:data.locationProof,requireProof:true});if(!access.allowed)return [403,{error:access.reason}];
  const record=async callee=>{if(/^[a-f0-9]{64}$/.test(data.callKey||''))await pool.query('INSERT INTO location_sip_calls(call_key,tenant_id,caller_id,callee_id,caller_session_hash) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE call_key=VALUES(call_key)',[data.callKey,caller.tenant_id,caller.user_id,callee||null,access.leaseSessionHash||null]);};
  const rows=(await pool.query(`SELECT target.username,target.user_id FROM olamide_sip_call_access caller
   JOIN olamide_sip_call_access target ON target.tenant_id=caller.tenant_id AND target.domain=caller.domain
   WHERE caller.username=$1 AND caller.domain=$2 AND target.username=$3`,[data.caller,data.domain,data.destination])).rows;
  if(rows.length===1){const target=await serviceLocationAccess(pool,caller.tenant_id,rows[0].user_id);if(!target.allowed)return [403,{error:'Recipient location is unavailable'}];await record(rows[0].user_id);return [200,{route:'extension',username:rows[0].username}];}
  if(process.env.KAMAILIO_PSTN_ENABLED==='true'&&data.callKey){const result=await reservePstn(pool,data);if(result[0]===200)await record(null);return result;}
  return [403,{error:'Destination unavailable in workspace'}];
 }
 return [404,{error:'Not found'}];
}
export function startKamailioHttpBridge(pool){
 if(process.env.KAMAILIO_HTTP_BRIDGE_ENABLED!=='true')return null;
 const token=process.env.KAMAILIO_HTTP_BRIDGE_TOKEN;
 if(!bridgeAuthorized(`Bearer ${token}`,token))throw Error('Private Kamailio bridge token required');
 const server=http.createServer(async(req,res)=>{
  const send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(!bridgeAuthorized(req.headers.authorization,token))return send(401,{error:'Switch authentication required'});
  if(req.method!=='POST')return send(405,{error:'POST required'});
  try{
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(413,{error:'Request too large'});}
   const data=JSON.parse(body);if(!data||Array.isArray(data)||typeof data!=='object')return send(400,{error:'JSON object required'});
   const [code,result]=await bridgeLookup(pool,new URL(req.url,'http://localhost').pathname,data);send(code,result);
  }catch(error){send(error instanceof SyntaxError?400:503,{error:'Switch lookup unavailable'});}
 });
 server.requestTimeout=5000;server.headersTimeout=5000;
 server.listen(8081,process.env.LISTEN_ADDR||'127.0.0.1');
 return server;
}
