import test from 'node:test';
import assert from 'node:assert/strict';
import {convertUsdCents,minorUnits,parseParallelRate,createNairaQuote,handleNairaConfig,formatMinorUnits} from './nairaPayments.js';
import {handleStoreGateways,matchesPayment,reconcileStorePayment} from './storeGateways.js';
import {seal} from './providerCredentials.js';
import {handlePaymentCheckout} from './payments.js';
const tenant='00000000-0000-4000-8000-000000000003',id='00000000-0000-4000-8000-000000000002';
const user={id,tenant_id:tenant,role:'user',features:{billing:true}},send=(_,status,body)=>({status,body});
const now=Date.parse('2026-10-30T20:00:00Z');
const rateData={timestamp:new Date(now).toISOString(),baseCurrency:'NGN',rateType:'black_market',source:'abokiforex.app',rates:{USD:{buy:1500,sell:1555.123456}}};
test('conversion uses integer half-up kobo rounding and exact currency units',()=>{
 assert.equal(convertUsdCents(995,'1555.123456'),1547348);
 assert.equal(convertUsdCents(1,'1.5'),2);
 assert.equal(minorUnits('15473.48'),1547348);
 assert.equal(minorUnits('9.9500'),995);
 assert.equal(formatMinorUnits(1547348),'15473.48');
 assert.equal(formatMinorUnits(Number.MAX_SAFE_INTEGER),'90071992547409.91');
 for(const rate of [0,-1,NaN,Infinity,'1e3','1555.1234567'])assert.throws(()=>convertUsdCents(100,rate));
 for(const amount of ['1.001','NaN','-1','1e3','9007199254740991'])assert.throws(()=>minorUnits(amount));
});
test('rate validation refuses official, stale, future, missing and reversed rates',()=>{
 assert.equal(parseParallelRate(rateData,now).rate,'1555.123456');
 for(const patch of [{rateType:'official'},{baseCurrency:'USD'},{source:'other'},{timestamp:new Date(now-91*60000).toISOString()},{timestamp:new Date(now+2*60000).toISOString()},{rates:{}}])assert.throws(()=>parseParallelRate({...rateData,...patch},now));
});
test('quote reads authenticated feed and persists immutable conversion evidence',async()=>{
 process.env.PAYMENT_CONFIG_KEY='12'.repeat(32);
 const calls=[],pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:sql.startsWith('SELECT')?[{ciphertext:seal({apiKey:'private-feed-key'},Buffer.from(process.env.PAYMENT_CONFIG_KEY,'hex'),tenant,'ngn-fx')}]:[]};}};
 const quote=await createNairaQuote(pool,{id,amount_cents:995,currency:'USD'},user,{now,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://abokiforexpaid.uc.r.appspot.com/_ah/api/forex/v1/rates');assert.equal(options.headers['X-API-Key'],'private-feed-key');assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>rateData};
 }});
 assert.equal(quote.amountCents,1547348);assert.equal(quote.currency,'NGN');assert.equal(quote.rateSide,'sell');assert.equal(quote.expiresAt.getTime()-now,600000);
 assert.match(calls[1].sql,/INSERT INTO naira_payment_quotes/);assert.equal(JSON.stringify(quote).includes('private-feed-key'),false);
});
test('stale feed cannot create a quote; native NGN is never converted twice',async()=>{
 process.env.PAYMENT_CONFIG_KEY='12'.repeat(32);let inserts=0;
 const pool={query:async(sql)=>{if(sql.startsWith('INSERT'))inserts++;return {rows:[{ciphertext:seal({apiKey:'key'},Buffer.from(process.env.PAYMENT_CONFIG_KEY,'hex'),tenant,'ngn-fx')}]};}};
 await assert.rejects(createNairaQuote(pool,{id,amount_cents:995,currency:'USD'},user,{now,fetchImpl:async()=>({ok:true,json:async()=>({...rateData,timestamp:'2020-01-01'})})}));assert.equal(inserts,0);
 const quote=await createNairaQuote(pool,{id,amount_cents:155500,currency:'NGN'},user,{now,fetchImpl:()=>{throw Error('must not fetch');}});assert.equal(quote.amountCents,155500);assert.equal(quote.source,'native-NGN');
});
test('clients cannot route an NGN request through Paystack or replace the FX rate',async()=>{
 let queries=0;
 const r=await handleStoreGateways({req:{method:'POST'},path:'/api/marketplace/checkout',user,send,pool:{query:async()=>{queries++;return {rows:[]};}},readJson:async()=>({invoiceId:id,provider:'paystack',currency:'NGN',rate:1})});
 assert.equal(r.status,400);assert.equal(queries,1); // store policy only; never contacts payment provider
});
test('verification compares NGN against the saved quote rather than base USD',()=>{
 const a={id,provider:'flutterwave',amount_cents:995,currency:'USD',charge_amount_cents:1547348,charge_currency:'NGN'};
 const d={id:123,tx_ref:id,status:'successful',currency:'NGN',amount:'15473.48'};
 assert.equal(matchesPayment(a,d),true);
 for(const patch of [{amount:9.95},{amount:'15473.479'},{currency:'USD'},{tx_ref:tenant}])assert.equal(matchesPayment(a,{...d,...patch}),false);
 assert.equal(matchesPayment({...a,provider:'paystack'},{...d,status:'success',reference:id,amount:1547348}),false);
});
test('rate-feed configuration rejects ordinary administrators',async()=>{
 assert.equal((await handleNairaConfig({req:{method:'PUT'},user:{...user,role:'admin'},send,pool:{}})).status,403);
});
test('Stripe cannot silently convert an NGN checkout request to USD',async()=>{
 const r=await handlePaymentCheckout({req:{method:'POST'},user,send,pool:{query:()=>{throw Error('must reject before database access');}},readJson:async()=>({invoiceId:id,currency:'NGN'})});
 assert.equal(r.status,400);
});
test('checkout refuses expired and cross-user quotes before creating a payment',async()=>{
 process.env.PAYMENT_CONFIG_KEY='12'.repeat(32);
 for(const quote of [undefined,{base_amount_cents:995,base_currency:'USD',expires_at:new Date(Date.now()-1000)}]){
  const calls=[],query=async(sql,args)=>{calls.push(sql);
   if(sql.includes('FROM store_gateways'))return {rows:[{enabled:true,environment:'test',ciphertext:seal({secretKey:'FLWSECK_TEST-merchant'},Buffer.from(process.env.PAYMENT_CONFIG_KEY,'hex'),tenant,'flutterwave')}]};
   if(sql.includes('FROM invoices'))return {rows:[{id,amount_cents:995,currency:'USD',email:'example@example.test'}]};
   if(sql.includes('FROM naira_payment_quotes')){assert.deepEqual(args,[id,tenant,id,id]);return {rows:quote?[quote]:[]};}
   return {rows:[],rowCount:1};
  };
  const pool={query,connect:async()=>({query,release(){}})};
  const r=await handleStoreGateways({req:{method:'POST'},path:'/api/marketplace/checkout',user,send,pool,readJson:async()=>({invoiceId:id,provider:'flutterwave',currency:'NGN',quoteId:id}),fetchImpl:()=>{throw Error('must not charge');}});
  assert.equal(r.status,409);assert.ok(!calls.some(sql=>sql.startsWith('INSERT INTO payment_attempts')));assert.equal(calls.at(-1),'ROLLBACK');
 }
});
test('verified converted payment settles the original USD invoice without re-fetching FX',async()=>{
 process.env.PAYMENT_CONFIG_KEY='12'.repeat(32);
 const a={id,invoice_id:id,user_id:id,tenant_id:tenant,provider:'flutterwave',amount_cents:995,currency:'USD',status:'open'},calls=[];
 const query=async(sql,args)=>{calls.push({sql,args});
  if(sql.includes('FROM store_gateways'))return {rows:[{enabled:true,environment:'test',ciphertext:seal({secretKey:'FLWSECK_TEST-merchant'},Buffer.from(process.env.PAYMENT_CONFIG_KEY,'hex'),tenant,'flutterwave')}]};
  if(sql.includes('FROM naira_payment_quotes'))return {rows:[{base_amount_cents:995,base_currency:'USD',invoice_id:id,user_id:id,charge_amount_cents:1547348}]};
  if(sql.includes('FROM invoices'))return {rows:[{status:'unpaid',amount_cents:995,currency:'USD'}]};
  if(sql.includes('SELECT status FROM payment_attempts'))return {rows:[{status:'open'}]};
  return {rows:[],rowCount:1};
 };
 const pool={query,connect:async()=>({query,release(){}})};
 const result=await reconcileStorePayment(pool,a,{fetchImpl:async(url)=>{assert.match(url,/api\.flutterwave\.com\/v3\/transactions\/verify_by_reference/);return {ok:true,json:async()=>({status:'success',data:{id:999,tx_ref:id,amount:'15473.48',currency:'NGN',status:'successful'}})};}});
 assert.equal(result.status,200);assert.ok(calls.some(x=>x.sql.includes("UPDATE invoices SET status='paid'")));assert.equal(calls.at(-1).sql,'COMMIT');
});
test('NGN checkout sends only the saved amount to Flutterwave and consumes the quote',async()=>{
 process.env.PAYMENT_CONFIG_KEY='12'.repeat(32);const calls=[];
 const quote={id,base_amount_cents:995,base_currency:'USD',charge_amount_cents:1547348,rate:'1555.123456',source:'abokiforex.app',expires_at:new Date(Date.now()+600000)};
 const query=async(sql,args)=>{calls.push({sql,args});
  if(sql.includes('FROM store_gateways'))return {rows:[{enabled:true,environment:'test',ciphertext:seal({secretKey:'FLWSECK_TEST-merchant'},Buffer.from(process.env.PAYMENT_CONFIG_KEY,'hex'),tenant,'flutterwave')}]};
  if(sql.includes('FROM invoices'))return {rows:[{id,amount_cents:995,currency:'USD',email:'example@example.test'}]};
  if(sql.includes('FROM naira_payment_quotes'))return {rows:[quote]};
  return {rows:[],rowCount:1};
 };
 const pool={query,connect:async()=>({query,release(){}})};
 const r=await handleStoreGateways({req:{method:'POST'},path:'/api/marketplace/checkout',user,send,pool,origin:'https://sip.dobhrap.com',readJson:async()=>({invoiceId:id,provider:'flutterwave',currency:'NGN',quoteId:id,rate:1,amountCents:1}),fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.flutterwave.com/v3/payments');const body=JSON.parse(options.body);
  assert.equal(body.currency,'NGN');assert.equal(body.amount,'15473.48');assert.equal(body.meta.quote_id,id);assert.ok(body.configurations.session_duration<=10);
  return {ok:true,json:async()=>({status:'success',data:{link:'https://checkout.flutterwave.com/test'}})};
 }});
 assert.equal(r.status,201);assert.equal(r.body.currency,'NGN');assert.equal(r.body.amountCents,1547348);
 const saved=calls.find(x=>x.sql.startsWith('INSERT INTO payment_attempts'));assert.equal(saved.args[5],995);assert.equal(saved.args[6],'USD');
 assert.ok(calls.some(x=>x.sql.startsWith('UPDATE naira_payment_quotes SET attempt_id=')));
});
