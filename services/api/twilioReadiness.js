import {products,hubSettings,twilioRequest} from './twilioHub.js';
import {roleSettings} from './twilioRoles.js';
import {accountAuthPolicy} from './twilioAccountAuth.js';

export function readinessRows({configured,roles,callerPolicy,accountPolicy,profile}){
 return products.map(p=>{
  let state='implementation-required',requirements=p.requirements,controls='catalog';
  if(p.id==='verify'){
   state=configured&&roles.otp&&callerPolicy?.enabled?'configured':'setup-required';controls='verification';
   requirements='Caller-ID Verify policy, allowed destinations, funded account and successful phone delivery. Account PIN/OTP has a separate policy. Configuration is not delivery acceptance.';
  }
  if(p.id==='sip'){
   controls='trunk';requirements='Remote TK trunk and IP authorization; Twilio billing adapter; switch routing; caller-ID and geofence checks; current rates and capacity; two-way audio acceptance.';
   // Existing Flowroute commissioning cannot be inherited by a new provider.
   state='implementation-required';
  }
  if(p.id==='numbers'||p.id==='tollfree'){controls='did';requirements+='; transactional customer purchase, wallet hold, unique allocation, regulatory validation, inbound routes and rental reconciliation are not implemented';}
  if(p.id==='sms'){controls='sms';requirements+='; customer send, segment/carrier-fee billing, verified callbacks and uncertain-submission reconciliation are not implemented';}
  if(p.id==='whatsapp'){controls='whatsapp';requirements+='; WhatsApp runtime adapter, customer consent/session/template validation and billing are not implemented';}
  return {id:p.id,name:p.name,category:p.category,state,controls,requirements,live:false,markupPercent:30};
 });
}
export async function readTwilioReadiness(pool,user,{remote=false}={}){
 const [hub,roles,accountPolicy,caller,profile]=await Promise.all([
  hubSettings(pool,user.tenant_id),roleSettings(pool,user.tenant_id),accountAuthPolicy(pool,user.tenant_id),
  pool.query('SELECT policy FROM caller_verification_settings WHERE tenant_id=$1',[user.tenant_id]),
  pool.query("SELECT status,routing_mode,max_concurrent_calls FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider='twilio'",[user.tenant_id])
 ]);
 const raw=caller.rows[0]?.policy,callerPolicy=raw?(typeof raw==='string'?JSON.parse(raw):raw):null;
 const configured=!!hub?.enabled&&!!hub.credentials;
 let account={checked:false,status:'unchecked'};
 if(remote){if(!configured)account={checked:false,status:'credentials-required'};else try{const result=await twilioRequest(hub.credentials,'account');account={checked:true,status:result.status,matching:result.sid===hub.credentials.accountSid};}catch{account={checked:true,status:'unavailable'};}}
 const rows=readinessRows({configured,roles,callerPolicy,accountPolicy,profile:profile.rows[0]});
 return {provider:'twilio',generatedAt:new Date().toISOString(),configured,roles,account,
  accountAuthentication:{signup:accountPolicy.signup,login:accountPolicy.login,requirePin:accountPolicy.requirePin,serviceConfigured:!!accountPolicy.serviceSid,liveDeliveryVerified:false},
  products:rows,live:false,
  summary:{catalog:rows.length,configured:rows.filter(x=>x.state==='configured').length,implementationRequired:rows.filter(x=>x.state==='implementation-required').length,commissioned:0},
  blockers:['Twilio SIP termination is blocked by the existing Flowroute-only billing/switch adapter','Automated customer DID purchase and unique allocation adapter is missing','Customer SMS and WhatsApp submission/billing adapters are missing','Least-cost routing is not wired into submissions','Live delivery and two-way media acceptance have not been recorded'],
  note:'This report does not activate routes, send messages, purchase numbers, infer acceptance from configuration, or bypass geofences, caller identity or wallet checks.'};
}
export async function handleTwilioReadiness({req,res,pool,user,send}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Unsupported readiness action'});
 res.setHeader('Cache-Control','no-store');return send(res,200,await readTwilioReadiness(pool,user,{remote:req.method==='POST'}));
}
