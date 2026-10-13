import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
const normalize=value=>String(value||'').replace(/^::ffff:/,'');
export function createProxyClientResolver({resolve=()=>lookup('web',{all:true}),now=Date.now}={}){
 let peers=[],expires=0,pending;
 return async req=>{
  const peer=normalize(req.socket.remoteAddress);
  if(now()>=expires){
   if(!pending)pending=Promise.resolve().then(resolve).then(rows=>{peers=rows.map(row=>normalize(row.address));}).catch(()=>{peers=[];}).finally(()=>{expires=now()+30000;pending=null;});
   await pending;
  }
  // Only the Compose web/Caddy peer can supply client identity. Ignore arbitrary forwarding headers.
  if(peers.includes(peer)){
   const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
   if(isIP(forwarded))return normalize(forwarded);
  }
  return peer||'unknown';
 };
}
export function createRequestLimiter({now=Date.now,maxKeys=10000}={}){
 const buckets=new Map();
 return {check(key,maximum){
  const time=now();let entry=buckets.get(key);
  if(!entry||time-entry.start>=60000){entry={start:time,count:0};if(!buckets.has(key)&&buckets.size>=maxKeys)buckets.delete(buckets.keys().next().value);buckets.set(key,entry);}
  entry.count++;
  return {allowed:entry.count<=maximum,retryAfter:Math.max(1,Math.ceil((60000-(time-entry.start))/1000))};
 }};
}
export function requestLimitRule({path,userId,client,external=false,actions=120,auth=20}){
 if(external)return {key:'integration:'+path+':'+client,maximum:path==='/api/switch/xml'?3000:120};
 if(path.startsWith('/api/login')||path.startsWith('/api/register')||path.startsWith('/api/passkeys/login/'))return {key:'auth:'+client,maximum:auth};
 if(!userId)return {key:'anonymous:'+client,maximum:auth};
 const scope=path.startsWith('/api/sip-account')?'sip':path==='/api/activity/events'?'activity':path.startsWith('/api/contacts')?'contacts':path.startsWith('/api/native-push')?'push':'actions';
 const maximum={sip:20,activity:60,contacts:120,push:60,actions}[scope];
 return {key:scope+':'+userId,maximum};
}
