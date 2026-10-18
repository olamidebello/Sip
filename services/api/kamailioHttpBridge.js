import {inboundDid} from './flowrouteDidRouting.js';
import http from 'node:http';
import {reservePstn,settlePstn} from './pstnBilling.js';
import {timingSafeEqual} from 'node:crypto';
export function bridgeAuthorized(header,token){
 if(!/^[0-9a-f]{64}$/.test(token||''))return false;
 const expected=Buffer.from(`Bearer ${token}`),actual=Buffer.from(header||'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function bridgeLookup(pool,path,data){
 if(path==='/api/switch/kamailio/inbound')return inboundDid(pool,data);
 const identity=/^[a-zA-Z0-9]{2,64}$/;
 if(path==='/api/switch/kamailio/billing-event')return settlePstn(pool,data);

 if(typeof data.domain!=='string'||!/^[-a-zA-Z0-9.]{1,253}$/.test(data.domain))return [400,{error:'Invalid domain'}];
 if(path==='/api/switch/kamailio/auth'){
  if(!identity.test(data.username||''))return [400,{error:'Invalid username'}];
  const row=(await pool.query('SELECT ha1 FROM olamide_sip_auth WHERE username=$1 AND domain=$2',[data.username,data.domain])).rows[0];
  return row?[200,{ha1:row.ha1}]:[403,{error:'Account unavailable'}];
 }
 if(path==='/api/switch/kamailio/route'){
  if(String(data.destination||'').startsWith('+')&&(process.env.KAMAILIO_PSTN_ENABLED!=='true'||!data.callKey))return [403,{error:'Paid route not authorized'}];
  if(!identity.test(data.caller||'')||!(identity.test(data.destination||'')||/^\+?[1-9][0-9]{7,14}$/.test(data.destination||'')))return [403,{error:'Internal SIP identities required'}];
  const rows=(await pool.query(`SELECT target.username FROM olamide_sip_call_access caller
   JOIN olamide_sip_call_access target ON target.tenant_id=caller.tenant_id AND target.domain=caller.domain
   WHERE caller.username=$1 AND caller.domain=$2 AND target.username=$3`,[data.caller,data.domain,data.destination])).rows;
  if(rows.length===1)return [200,{route:'extension',username:rows[0].username}];
  if(process.env.KAMAILIO_PSTN_ENABLED==='true'&&data.callKey)return reservePstn(pool,data);
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
