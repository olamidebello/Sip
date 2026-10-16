import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyStripeSignature,verifyStripeConnection,handlePaymentCheckout,handlePaymentAdmin} from './payments.js';
const tenant='00000000-0000-4000-8000-000000000002';
const user={id:tenant,tenant_id:tenant,role:'user',features:{billing:true}};
const send=(res,status,body)=>({status,body});
test('Stripe webhook signature binds exact raw bytes and fresh timestamp',()=>{
  const raw=Buffer.from('{"id":"evt_1"}'),secret='whsec_example',time=1700000000;
  const hash=createHmac('sha256',secret).update(`${time}.`).update(raw).digest('hex');
  const header=`t=${time},v1=${hash}`;
  assert.equal(verifyStripeSignature(raw,header,secret,time*1000),true);
  assert.equal(verifyStripeSignature(Buffer.from('{"id":"evt_2"}'),header,secret,time*1000),false);
  assert.equal(verifyStripeSignature(raw,header,secret,(time+301)*1000),false);
  assert.equal(verifyStripeSignature(raw,'t=x,v1='+hash,secret,time*1000),false);
});
test('checkout rejects invalid invoice before contacting provider',async()=>{
  let queried=false;
  const result=await handlePaymentCheckout({req:{method:'POST'},res:{},user,pool:{query:async()=>{queried=true;}},send,
    readJson:async()=>({invoiceId:'invalid'}),origin:'https://example.com',fetchImpl:()=>{throw Error('provider contacted');}});
  assert.equal(result.status,400);assert.equal(queried,false);
});
test('tenant admin cannot modify another tenant in gateway route',async()=>{
  const result=await handlePaymentAdmin({req:{method:'PUT'},res:{},path:'/api/admin/payments/gateway',user,pool:{},send,readJson:async()=>({})});
  assert.equal(result.status,403);
});

test('Stripe check uses a read-only server request and hides provider data',async()=>{
 const result=await verifyStripeConnection('sk_test_private',async(url,options)=>{assert.equal(url,'https://api.stripe.com/v1/balance');assert.equal(options.headers.Authorization,'Bearer sk_test_private');return {ok:true,json:async()=>({object:'balance',livemode:false,available:[{amount:999}]})};});
 assert.equal(result.mode,'test');assert.equal(result.cardIssuingAvailable,false);assert.equal(JSON.stringify(result).includes('999'),false);
 await assert.rejects(verifyStripeConnection('sk_live_private',async()=>({ok:true,json:async()=>({object:'balance',livemode:false})})));
 await assert.rejects(verifyStripeConnection('sk_test_private',async()=>({ok:false,json:async()=>({error:'private'})})));
});
test('ordinary administrator cannot change or verify Stripe credentials',async()=>{
 for(const path of ['/api/admin/payments/gateway','/api/admin/payments/gateway/verify']){
 const result=await handlePaymentAdmin({req:{method:'POST'},res:{},path,user:{...user,role:'admin'},pool:{query:async()=>({rows:[],rowCount:0})},send});assert.equal(result.status,403);
 }
});
