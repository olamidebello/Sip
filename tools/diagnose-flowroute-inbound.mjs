// Read-only owner and SIP provisioning checks; outputs masked DID suffixes only.
import {createDatabase} from '/app/db.js';
import {lookupInboundDidOwner} from '/app/inboundDidOwner.js';
const db=createDatabase(process.env.MYSQL_URL),emit=(k,v)=>console.log('SIP_INBOUND_CHECK '+k+'='+v);
try{
 const tenant=process.env.FLOWROUTE_WEBHOOK_TENANT_ID||(await import('/app/tenancy.js')).defaultTenantId;
 const rows=(await db.query(`SELECT number_e164 FROM flowroute_sms_numbers WHERE tenant_id=$1
 UNION SELECT number_e164 FROM inhouse_dids WHERE tenant_id=$1
 UNION SELECT number_e164 FROM did_shop_orders WHERE tenant_id=$1
 UNION SELECT q.number_e164 FROM did_quotes q JOIN users u ON u.id=q.user_id WHERE u.tenant_id=$1 AND q.provider='flowroute' AND q.status='fulfilled' LIMIT 200`,[tenant])).rows;
 const numbers=[...new Set(rows.map(r=>'+'+String(r.number_e164).replace(/^\+/,'')))];emit('known_numbers',numbers.length);
 for(const number of numbers){
  emit('did_suffix',number.slice(-4));const owner=await lookupInboundDidOwner(db,tenant,number);
  emit('unique_active_owner',!!owner);if(!owner)continue;
  const sip=(await db.query('SELECT status FROM sip_accounts WHERE user_id=$1',[owner.user_id])).rows;
  emit('sip_accounts',sip.length);
  if(sip.length===1)emit('sip_state',['active','pending','error','disabled','provisioned'].includes(sip[0].status)?sip[0].status:'unknown');
 }
}catch(e){emit('diagnostic',['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(e.code)?e.code:'failed');process.exitCode=1;}finally{await db.end();}
