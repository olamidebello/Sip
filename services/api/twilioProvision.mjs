import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

const sid=(v,p)=>typeof v==='string'&&new RegExp('^'+p+'[a-f0-9]{32}$','i').test(v);
export function verifyServiceNames(tenant){const tag=createHash('sha256').update(tenant).digest('hex').slice(0,20).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));return {caller:'SM '+tag+' Caller',account:'SM '+tag+' Login'};}
export function validateProvision(config){
 if(!config||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(config.tenantId||''))throw Error('Explicit tenant UUID required');
 if(isIP(config.publicIp)!==4||/^(0|10|127|169\.254|192\.168)\./.test(config.publicIp)||/^172\.(1[6-9]|2\d|3[01])\./.test(config.publicIp))throw Error('Public IPv4 SIP egress address required');
 if(!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\.pstn\.twilio\.com$/.test(config.domain||''))throw Error('Explicit Twilio termination domain required');
 if(config.originationUri){const expected='sip:'+config.publicIp+':5060;transport=udp';if(config.originationUri!==expected)throw Error('Origination URI must use the configured SIP host and port');}
 return {tenantId:config.tenantId,publicIp:config.publicIp,domain:config.domain,originationUri:config.originationUri||''};
}

// All URLs are fixed Twilio API families; redirects and arbitrary pagination URLs are forbidden.
export function client(credentials,fetcher=fetch){
 if(!sid(credentials?.accountSid,'AC'))throw Error('Configured AC account SID required');
 const pair=credentials.apiKeySid&&credentials.apiKeySecret?[credentials.apiKeySid,credentials.apiKeySecret]:[credentials.accountSid,credentials.authToken];
 if(!pair[1])throw Error('Configured Twilio secret required');
 return async function request(base,path,form){
  if(!['api','trunking','messaging','verify'].includes(base)||!path.startsWith('/'))throw Error('Invalid Twilio API');
  let response;
  try{response=await fetcher('https://'+base+'.twilio.com'+path,{method:form?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(pair.join(':')).toString('base64'),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:form?new URLSearchParams(form).toString():undefined,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('Twilio response uncertain; reconcile remote resource before retrying');}
  let data;try{data=await response.json();}catch{throw Error('Unreadable Twilio response; reconcile before retrying');}
  if(!response.ok){const operation=base+' '+(form?'POST':'GET')+' '+path.split('?')[0].replace(/\b[A-Z]{2}[a-f0-9]{32}\b/gi,'{SID}');const invalid=/^Invalid parameter:\s*([A-Za-z][A-Za-z0-9_]{0,39})\s*$/.exec(data?.message||'');const field=invalid&&['FriendlyName','PageSize','ServiceSid','UniqueName','CodeLength','DomainName','To','Channel'].includes(invalid[1])?' invalid '+invalid[1]:'';const e=Error(operation+': Twilio HTTP '+response.status+(Number.isInteger(data?.code)?' code '+data.code:'')+field);e.status=response.status;e.providerCode=data?.code;throw e;}
  return data;
 };
}

// The caller holds a tenant advisory lock. A persisted starting/unknown job is never replayed.
export async function ensureResource({db,tenant,account,name,base,path,listKey,identity,form,request,apply,changes}){
 let listing;try{listing=await request(base,path+(path.includes('?')?'&':'?')+'PageSize=50');}catch(e){throw Error(name+' inventory lookup: '+e.message);}
 if(listing.next_page_uri||listing.meta?.next_page_url)throw Error('Resource listing is incomplete; narrow inventory before provisioning');
 if(!Array.isArray(listing[listKey]))throw Error('Unexpected resource listing: '+name);
 const matches=listing[listKey].filter(identity);
 if(matches.length>1)throw Error('Ambiguous existing resource: '+name);
 if(matches.length===1){const result=matches[0];if(result.account_sid&&result.account_sid!==account)throw Error('Remote resource account mismatch');return result;}
 const hash=createHash('sha256').update(JSON.stringify([account,base,path,form])).digest('hex');
 const key=hash.slice(0,8)+'-'+hash.slice(8,12)+'-'+hash.slice(12,16)+'-'+hash.slice(16,20)+'-'+hash.slice(20,32);
 const prior=(await db.query('SELECT status,resource_sid FROM twilio_hub_jobs WHERE tenant_id=$1 AND request_key=$2',[tenant,key])).rows[0];
 if(prior)throw Error('Provisioning job '+name+' is '+prior.status+' but remote resource is absent; reconcile instead of retrying');
 if(!apply)return {sid:null,planned:true};
 await db.query("INSERT INTO twilio_hub_jobs(id,tenant_id,request_key,operation,request_hash,status) VALUES(UUID(),$1,$2,'auto-resource',$3,'starting')",[tenant,key,hash]);
 try{
  const result=await request(base,path,form);
  if(!/^[A-Z]{2}[a-f0-9]{32}$/i.test(result?.sid||'')||(result.account_sid&&result.account_sid!==account))throw Error('Unconfirmed remote creation');
  await db.query("UPDATE twilio_hub_jobs SET status='created',resource_sid=$1 WHERE tenant_id=$2 AND request_key=$3",[result.sid,tenant,key]);
  changes.push(name);return result;
 }catch(error){
  await db.query("UPDATE twilio_hub_jobs SET status='unknown' WHERE tenant_id=$1 AND request_key=$2 AND status='starting'",[tenant,key]);
  throw Error(name+': '+error.message+'. This request will not be automatically repeated.');
 }
}

export async function provisionResources({db,config,credentials,apply=false,fetcher=fetch}){
 const c=validateProvision(config),request=client(credentials,fetcher),changes=[];
 const account=await request('api','/2010-04-01/Accounts/'+credentials.accountSid+'.json');
 if(account.sid!==credentials.accountSid||account.status!=='active')throw Error('Active matching Twilio account required');
 const prefix='Smooth '+c.tenantId;
 const names=verifyServiceNames(c.tenantId);
 const ensure=(options)=>ensureResource({db,tenant:c.tenantId,account:credentials.accountSid,request,apply,changes,...options});
 const verify=credentials.verifyServiceSid?await request('verify','/v2/Services/'+credentials.verifyServiceSid):await ensure({name:'Verify Service',base:'verify',path:'/v2/Services',listKey:'services',identity:r=>[names.caller,prefix+' Verify'].includes(r.friendly_name),form:{FriendlyName:names.caller,CodeLength:'6'}});
 const messaging=credentials.messagingServiceSid?await request('messaging','/v1/Services/'+credentials.messagingServiceSid):await ensure({name:'Messaging Service',base:'messaging',path:'/v1/Services',listKey:'services',identity:r=>r.friendly_name===prefix+' SMS',form:{FriendlyName:prefix+' SMS'}});
 const accountVerify=await ensure({name:'Account Verify Service',base:'verify',path:'/v2/Services',listKey:'services',identity:r=>[names.account,prefix+' Account'].includes(r.friendly_name),form:{FriendlyName:names.account,CodeLength:'6'}});
 if(!accountVerify.planned&&(!sid(accountVerify.sid,'VA')||accountVerify.account_sid!==credentials.accountSid))throw Error('Account Verify Service ownership mismatch');
 for(const [resource,type] of [[verify,'VA'],[messaging,'MG']])if(!resource.planned&&(!sid(resource.sid,type)||resource.account_sid!==credentials.accountSid))throw Error('Service account mismatch');
 const trunk=await ensure({name:'SIP trunk',base:'trunking',path:'/v1/Trunks',listKey:'trunks',identity:r=>r.domain_name===c.domain,form:{FriendlyName:prefix+' SIP',DomainName:c.domain}});
 if(!trunk.planned&&(!sid(trunk.sid,'TK')||trunk.domain_name!==c.domain))throw Error('Trunk identity mismatch');
 const aclPath='/2010-04-01/Accounts/'+credentials.accountSid+'/SIP/IpAccessControlLists.json';
 const acl=await ensure({name:'SIP IP access list',base:'api',path:aclPath,listKey:'ip_access_control_lists',identity:r=>r.friendly_name===prefix+' SIP IP',form:{FriendlyName:prefix+' SIP IP'}});
 if(acl.sid){
  if(!sid(acl.sid,'AL'))throw Error('Invalid ACL SID');
  await ensure({name:'SIP egress IP',base:'api',path:aclPath.replace('.json','/'+acl.sid+'/IpAddresses.json'),listKey:'ip_addresses',identity:r=>r.ip_address===c.publicIp&&Number(r.cidr_prefix_length??32)===32,form:{FriendlyName:'Smooth SIP host',IpAddress:c.publicIp,CidrPrefixLength:'32'}});
 }
 if(trunk.sid&&acl.sid)await ensure({name:'Trunk ACL association',base:'trunking',path:'/v1/Trunks/'+trunk.sid+'/IpAccessControlLists',listKey:'ip_access_control_lists',identity:r=>r.sid===acl.sid,form:{IpAccessControlListSid:acl.sid}});
 if(trunk.sid&&c.originationUri){const inbound=await ensure({name:'Inbound SIP destination',base:'trunking',path:'/v1/Trunks/'+trunk.sid+'/OriginationUrls',listKey:'origination_urls',identity:r=>r.sip_url===c.originationUri,form:{FriendlyName:'Smooth SIP inbound',SipUrl:c.originationUri,Priority:'10',Weight:'10',Enabled:'true'}});if(!inbound.planned&&inbound.enabled!==true)throw Error('Existing origination destination is disabled; existing policy was preserved');}
 return {mode:apply?'apply':'plan',changes,verifyServiceSid:verify.sid,accountVerifyServiceSid:accountVerify.sid,messagingServiceSid:messaging.sid,trunkSid:trunk.sid,aclSid:acl.sid,domain:c.domain,live:false,otpPurpose:'Caller-ID and account authentication use separate Verify Services; account policy is opt-in',remaining:['Commission Twilio switch termination and two-way audio','Install transactional DID purchase/allocation adapter and regulatory requirements','Install authorized customer SMS adapter, billing and reconciliation','Wire least-cost selection into call and SMS submission after all eligibility checks']};
}
