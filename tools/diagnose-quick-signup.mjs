// Read-only: never prints messages, addresses, phone numbers, tokens or credentials.
import {createHash} from 'node:crypto';
import {createDatabase} from '/app/db.js';
import {defaultTenantId} from '/app/tenancy.js';
const db=createDatabase(process.env.MYSQL_URL);
const emit=(key,value)=>console.log('SIP_SIGNUP_CHECK '+key+'='+value);
try{
 emit('webhook_configured',(process.env.FLOWROUTE_WEBHOOK_TOKEN||'').length>=32);
 emit('webhook_tenant_matches',!process.env.FLOWROUTE_WEBHOOK_TENANT_ID||process.env.FLOWROUTE_WEBHOOK_TENANT_ID===defaultTenantId);
 const signups=(await db.query('SELECT code_hash,state,expires_at FROM quick_signups WHERE created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR) ORDER BY created_at DESC LIMIT 1000')).rows;
 for(const state of ['pending','verified','unavailable'])emit('recent_'+state,signups.filter(q=>q.state===state).length);
 const events=(await db.query("SELECT kind,sender,recipient,body,tenant_id,received_at FROM flowroute_message_events WHERE received_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR) AND kind='sms' ORDER BY received_at DESC LIMIT 1000")).rows;
 const phone=v=>'+'+String(v||'').replace(/^\+/, '');
 const inbound=events.filter(e=>phone(e.recipient)==='+12109050290');
 emit('received_at_signup_did',inbound.length);
 let valid=0,matched=0,pending=0,expiredOnArrival=0,wrongTenant=0,existingPhone=0;
 for(const event of inbound){
  const code=/^OLAMIDE ([A-F0-9]{16})$/i.exec(String(event.body||'').trim())?.[1]?.toUpperCase();
  if(!code)continue;valid++;
  const hash=createHash('sha256').update(code).digest('hex');
  const q=signups.find(q=>q.code_hash===hash);if(!q)continue;matched++;
  if(q.state==='pending')pending++;
  if(new Date(event.received_at)>=new Date(q.expires_at))expiredOnArrival++;
  if(event.tenant_id!==defaultTenantId)wrongTenant++;
  const r=await db.query('SELECT user_id FROM user_profiles WHERE phone_e164=$1 LIMIT 1',[phone(event.sender)]);
  if(r.rows.length)existingPhone++;
 }
 emit('valid_code_messages',valid);emit('matched_challenges',matched);emit('matched_still_pending',pending);
 emit('expired_on_arrival',expiredOnArrival);emit('wrong_tenant',wrongTenant);emit('sender_already_registered',existingPhone);
}catch(error){
 const allowed=['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR','ER_ACCESS_DENIED_ERROR','ECONNREFUSED'];
 emit('database_error',allowed.includes(error.code)?error.code:'UNCLASSIFIED');process.exitCode=1;
}finally{await db.end();}
