import {randomUUID} from 'node:crypto';
import {hubSettings,twilioRequest} from './twilioHub.js';
const root='/api/admin/twilio/credentials';
export function credentialStatus(hub){const c=hub?.credentials;return {enabled:!!hub?.enabled,version:Number(hub?.version||0),configured:Object.fromEntries(['accountSid','authToken','apiKeySid','apiKeySecret','verifyServiceSid','messagingServiceSid','sendgridKey','segmentToken'].map(f=>[f,!!c?.[f]])),restAuthentication:c?.apiKeySid&&c.apiKeySecret?'api-key':c?.authToken?'account-token':'unconfigured',callerVerificationReady:!!(hub?.enabled&&c?.accountSid&&c.authToken&&c.verifyServiceSid)};}
export async function testCredentials(c,country,request=twilioRequest){
 if(!/^[A-Z]{2}$/.test(country||''))throw Error('Two-letter country required');
 const checks=[['Account','account'],['Verify inventory','verify-list'],['Messaging inventory','messaging-list'],['Trunk inventory','trunk-list'],['Owned numbers','numbers'],['Number pricing','price-numbers']];const results=[];
 for(const [name,operation]of checks){try{const d=await request(c,operation,{country});const matching=operation!=='account'||d.sid===c.accountSid;results.push({name,operation,status:matching?'passed':'failed',...(operation==='account'?{matching,accountStatus:['active','suspended','closed'].includes(d.status)?d.status:'unknown'}:{})});}catch(e){const status=Number.isInteger(e.providerStatus)?e.providerStatus:null,code=Number.isInteger(e.providerCode)?e.providerCode:null;results.push({name,operation,status:'failed',httpStatus:status,providerCode:code,hint:status===401||status===403?'Check credential account, permissions and region. No alternate credential was attempted.':'API check unavailable; inspect provider setup. No write was attempted.'});}}
 return {checkedAt:new Date().toISOString(),country,checks:results,readOnly:true,creationPermissionVerified:false,liveDeliveryVerified:false,note:'Read access does not establish permission to create resources, purchase numbers, send messages or place calls. SendGrid and Segment use separate APIs and are not tested here.'};
}
export const credentialTargets=['account-token','api-key','verify-service','messaging-service','sendgrid','segment'];
export async function testOneCredential(c,target,request=twilioRequest,fetcher=fetch){
 if(!credentialTargets.includes(target))throw Error('Choose a supported credential test');
 const fields={'account-token':['accountSid','authToken'],'api-key':['accountSid','apiKeySid','apiKeySecret'],'verify-service':['accountSid','authToken','verifyServiceSid'],'messaging-service':['accountSid','messagingServiceSid'],sendgrid:['sendgridKey'],segment:['segmentToken']};
 const missing=fields[target].filter(f=>!c?.[f]);
 if(target==='messaging-service'&&!(c?.authToken||c?.apiKeySid&&c?.apiKeySecret))missing.push('REST authentication');
 const check={name:target,operation:target,status:'not_configured'};
 if(missing.length)check.hint='Configure '+missing.join(', ')+' first.';
 else try{
  let data;
  if(target==='sendgrid'||target==='segment'){
   const response=await fetcher(target==='sendgrid'?'https://api.sendgrid.com/v3/scopes':'https://api.segmentapis.com/',{method:'GET',headers:{Authorization:'Bearer '+(target==='sendgrid'?c.sendgridKey:c.segmentToken),Accept:target==='segment'?'application/vnd.segment.v1+json':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok){const e=Error('API check failed');e.providerStatus=response.status;throw e;}
   data=await response.json();
   if(target==='sendgrid'?!Array.isArray(data.scopes):!data.data?.workspace?.id)throw Error('Unexpected API response');
  }else{
   const credentials=target==='account-token'||target==='verify-service'?{accountSid:c.accountSid,authToken:c.authToken}:target==='api-key'?{accountSid:c.accountSid,apiKeySid:c.apiKeySid,apiKeySecret:c.apiKeySecret}:c;
   const operation=target==='verify-service'?'verify-fetch':target==='messaging-service'?'messaging-fetch':'numbers';
   data=await request(credentials,operation,{serviceSid:target==='verify-service'?c.verifyServiceSid:c.messagingServiceSid});
   if(target==='verify-service'||target==='messaging-service'){if(data.sid!==(target==='verify-service'?c.verifyServiceSid:c.messagingServiceSid)||data.account_sid!==c.accountSid)throw Error('Service account mismatch');}
   else if(!Array.isArray(data.incoming_phone_numbers))throw Error('Unexpected API response');
  }
  check.status='passed';check.hint='Read access confirmed for this saved credential. Sending and provisioning permissions were not tested.';
 }catch(e){check.status='failed';check.httpStatus=Number.isInteger(e.providerStatus)?e.providerStatus:null;check.providerCode=Number.isInteger(e.providerCode)?e.providerCode:null;check.hint=check.httpStatus===401||check.httpStatus===403?'Check this credential, its permissions, account and region. No alternate credential was attempted.':'Read check failed or timed out. Check provider availability, response and configured service account.';}
 return {target,checkedAt:new Date().toISOString(),checks:[check],readOnly:true,creationPermissionVerified:false,liveDeliveryVerified:false};
}
export async function handleTwilioCredentials({req,res,path,user,pool,send,readJson}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 res.setHeader('Cache-Control','no-store');
 if(path===root&&req.method==='GET'){const hub=await hubSettings(pool,user.tenant_id);const rows=(await pool.query('SELECT id,actor_id,hub_version,report,created_at FROM twilio_credential_tests WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 5',[user.tenant_id])).rows;return send(res,200,{...credentialStatus(hub),history:rows.map(r=>({...r,report:typeof r.report==='string'?JSON.parse(r.report):r.report}))});}
 if(path===root+'/test'&&req.method==='POST'){
  const b=await readJson(req);if(!Number.isInteger(b.version))return send(res,400,{error:'Current settings version required'});
  const hub=await hubSettings(pool,user.tenant_id);if(!hub?.credentials||hub.version!==b.version)return send(res,409,{error:'Credentials unavailable or changed; refresh first'});
  if(b.target!==undefined&&!credentialTargets.includes(b.target))return send(res,400,{error:'Choose a supported credential test'});
  const report=b.target?await testOneCredential(hub.credentials,b.target):await testCredentials(hub.credentials,String(b.country||'').toUpperCase());
  await pool.query('INSERT INTO twilio_credential_tests(id,tenant_id,actor_id,hub_version,report) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,hub.version,JSON.stringify(report)]);
  await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'twilio_keys_tested')",[randomUUID(),user.tenant_id,user.id]);
  return send(res,200,{...report,version:hub.version});
 }
 return send(res,405,{error:'Unsupported credential control'});
}
