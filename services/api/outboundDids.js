import {readFileSync} from 'node:fs';
export const didwwHosts=Object.freeze(['nyc.us.out.didww.com','lac.us.out.didww.com','mia.us.out.didww.com','fra.eu.out.didww.com','ams.eu.out.didww.com','sg.out.didww.com','hk.out.didww.com']);
const e164=/^\+[1-9][0-9]{7,14}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validatePolicy(value){
 if(!value||value.version!==1||!value.tenants||Array.isArray(value.tenants)||typeof value.tenants!=='object')throw Error('Invalid outbound DID policy');
 const numbers=new Set();
 for(const [tenant,c] of Object.entries(value.tenants)){
  if(!uuid.test(tenant)||!c||!Array.isArray(c.assignments))throw Error('Invalid outbound DID tenant');
  const users=new Set();
  for(const a of c.assignments){
   if(!a||!uuid.test(a.userId)||!e164.test(a.number)||!['flowroute','didww'].includes(a.provider)||a.authorized!==true||typeof a.evidence!=='string'||!a.evidence.trim()||users.has(a.userId)||numbers.has(a.number))throw Error('Unique authorized user/DID assignments and evidence required');
   users.add(a.userId);numbers.add(a.number);
   if(a.provider==='didww'&&(!c.didww||c.didww.ipOnlyApproved!==true||c.didww.allowedIpConfirmed!==true||c.didww.cliAuthorized!==true||!didwwHosts.includes(c.didww.host)||!Number.isInteger(c.didww.maxConcurrentCalls)||c.didww.maxConcurrentCalls<1||c.didww.maxConcurrentCalls>500||c.didww.techPrefix))throw Error('DIDWW requires approved IP-only authentication, allowed IP, authorized CLI, supported host, no Tech Prefix and capacity 1–500');
  }
 }
 return value;
}
export function loadPolicy(path=process.env.OUTBOUND_DID_POLICY_FILE||'/var/lib/olamide/service-inventory/outbound-dids.json'){
 try{return validatePolicy(JSON.parse(readFileSync(path,'utf8')));}
 catch(e){if(e.code==='ENOENT')return {version:1,tenants:{}};throw Error('Outbound DID policy unavailable or invalid');}
}
export function assignedIdentity(policy,tenant,user){
 const c=policy.tenants[tenant];if(!c)return null;
 const a=c.assignments.find(a=>a.userId===user);
 if(!a)throw Error('No authorized outbound DID assigned to this user');
 return {callerId:a.number,provider:a.provider,...(a.provider==='didww'?{carrierHost:c.didww.host,maxConcurrentCalls:c.didww.maxConcurrentCalls}:{})};
}
