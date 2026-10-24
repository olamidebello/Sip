import test from 'node:test';
import assert from 'node:assert/strict';
import {reservePstn} from './pstnBilling.js';
import {seal} from './providerCredentials.js';
test('digest trunks reserve credit while subscription and wallet checks stay enforced',async()=>{
 const prior={enabled:process.env.KAMAILIO_PSTN_ENABLED,key:process.env.PROVIDER_CREDENTIAL_KEY};
 process.env.KAMAILIO_PSTN_ENABLED='true';process.env.PROVIDER_CREDENTIAL_KEY='a'.repeat(64);
 const tenant='00000000-0000-4000-8000-000000000001';
 try{for(const [subscribed,balance,expected]of [[true,10000,200],[false,10000,403],[true,0,403]]){
  const writes=[];const ciphertext=seal({authenticationMode:'digest',pop:'US-East-VA',sipUsername:'12345678',sipPassword:'test-secret',techPrefix:'12345678',publicIp:'154.29.77.102',callerId:'+15551234567',maxConcurrentCalls:500},Buffer.from(process.env.PROVIDER_CREDENTIAL_KEY,'hex'),tenant,'flowroute_sip');
  const db={release(){},async query(sql,args=[]){let rows=[];
   if(sql.startsWith('SELECT tenant_id,user_id'))rows=[{tenant_id:tenant,user_id:'user',external_calls:subscribed?1:0}];
   else if(sql.includes('GET_LOCK'))rows=[{acquired:1}];
   else if(sql.startsWith('SELECT balance_cents,currency'))rows=[{balance_cents:balance,currency:'USD'}];
   else if(sql.startsWith('SELECT max_concurrent_calls'))rows=[{max_concurrent_calls:500}];
   else if(sql.startsWith('SELECT COUNT'))rows=[{n:0}];
   else if(sql.startsWith('SELECT r.*'))rows=[{cost_usd_per_minute:'0.01',price_usd_per_minute:'0.013',first_interval:60,sub_interval:60}];
   else if(sql.startsWith('SELECT ciphertext'))rows=[{ciphertext,enabled:1}];
   else if(sql.startsWith('SELECT revision'))rows=[{revision:1}];
   if(sql.startsWith('INSERT INTO pstn_calls')||sql.startsWith('UPDATE wallet_accounts'))writes.push([sql,args]);
   return {rows,rowCount:rows.length};
  }};
  const r=await reservePstn({connect:async()=>db},{caller:'subscriber',domain:'sip.example',destination:'+12149918553',callKey:'e'.repeat(64)});
  assert.equal(r[0],expected,JSON.stringify(r));
  assert.equal(writes.length>0,expected===200);
  if(expected===200){assert.equal(r[1].route,'pstn');assert.equal(r[1].callerId,'+15551234567');assert.equal(r[1].normalizedDestination,'12149918553');}
 }}finally{for(const [key,v]of [['KAMAILIO_PSTN_ENABLED',prior.enabled],['PROVIDER_CREDENTIAL_KEY',prior.key]])if(v===undefined)delete process.env[key];else process.env[key]=v;}
});
