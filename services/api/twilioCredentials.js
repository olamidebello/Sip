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
export async function handleTwilioCredentials({req,res,path,user,pool,send,readJson}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 res.setHeader('Cache-Control','no-store');
 if(path===root&&req.method==='GET'){const hub=await hubSettings(pool,user.tenant_id);const rows=(await pool.query('SELECT id,actor_id,hub_version,report,created_at FROM twilio_credential_tests WHERE tenant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 5',[user.tenant_id])).rows;return send(res,200,{...credentialStatus(hub),history:rows.map(r=>({...r,report:typeof r.report==='string'?JSON.parse(r.report):r.report}))});}
 if(path===root+'/test'&&req.method==='POST'){
  const b=await readJson(req);if(!Number.isInteger(b.version))return send(res,400,{error:'Current settings version required'});
  const hub=await hubSettings(pool,user.tenant_id);if(!hub?.credentials||hub.version!==b.version)return send(res,409,{error:'Credentials unavailable or changed; refresh first'});
  const report=await testCredentials(hub.credentials,String(b.country||'').toUpperCase());
  await pool.query('INSERT INTO twilio_credential_tests(id,tenant_id,actor_id,hub_version,report) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,hub.version,JSON.stringify(report)]);
  await pool.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'twilio_keys_tested')",[randomUUID(),user.tenant_id,user.id]);
  return send(res,200,{...report,version:hub.version});
 }
 return send(res,405,{error:'Unsupported credential control'});
}
