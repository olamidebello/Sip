import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import {matchesTopup,creditConfirmedTopup,acceptTopupEvent,handleWalletFunding,handleWalletFundingAdmin,fundingCapabilities,verifyTopup} from './walletFunding.js';
import {encryptPaymentSecret} from './stripeGateway.js';
import {handleStripeWebhook} from './payments.js';
import {handleWallet} from './wallet.js';
const tenant='00000000-0000-4000-8000-000000000001',userId='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
const user={id:userId,tenant_id:tenant,features:{billing:true},role:'user'};
const topup={id,tenant_id:tenant,user_id:userId,amount_cents:600,currency:'USD',status:'open',session_id:'cs_live_example'};
const session={id:'cs_live_example',object:'checkout.session',livemode:true,mode:'payment',status:'complete',payment_status:'paid',client_reference_id:id,amount_total:600,currency:'usd',metadata:{purpose:'wallet_topup',tenant_id:tenant,user_id:userId}};
const send=(_r,status,body)=>({status,body});
process.env.PAYMENT_CONFIG_KEY='12'.repeat(32);
const gateway={enabled:1,mode:'live',secret_key_cipher:encryptPaymentSecret('sk_live_example123456789'),webhook_secret_cipher:encryptPaymentSecret('whsec_test123456789')};
function stateDb(){const state={balance:125,credit:null,topup:{...topup},events:new Set(),updates:0};let snapshot;
 const query=async(sql,p=[])=>{const result=(rows=[],rowCount=rows.length)=>({rows,rowCount});
  if(sql==='START TRANSACTION'){snapshot=structuredClone(state);return result();}
  if(sql==='ROLLBACK'){Object.assign(state,snapshot);return result();}
  if(sql==='COMMIT'){snapshot=null;return result();}
  if(sql.startsWith('SELECT * FROM wallet_topups'))return result([{...state.topup}]);
  if(sql.startsWith('SELECT session_id,delta_cents'))return result(state.credit?[state.credit]:[]);
  if(sql.startsWith('SELECT balance_cents,currency'))return result([{balance_cents:state.balance,currency:'USD'}]);
  if(sql.startsWith('INSERT IGNORE INTO wallet_accounts'))return result([],1);
  if(sql.startsWith('INSERT INTO wallet_topup_credits')){assert.equal(state.credit,null);state.credit={session_id:p[5],delta_cents:p[3]};return result([],1);}
  if(sql.startsWith('UPDATE wallet_accounts')){state.balance+=Number(p[0]);state.updates++;return result([],1);}
  if(sql.startsWith("UPDATE wallet_topups SET status='paid'")){state.topup.status='paid';return result([],1);}
  if(sql.startsWith('UPDATE wallet_topups SET status=$1')){state.topup.status=p[0];return result([],1);}
  if(sql.startsWith('INSERT IGNORE INTO wallet_topup_events')){if(state.events.has(p[0]))return result([],0);state.events.add(p[0]);return result([],1);}
  throw Error('Unexpected SQL: '+sql);
 };return {state,query,release(){}};
}
test('confirmation requires paid live session, exact account, amount, currency and metadata',()=>{
 assert.equal(matchesTopup(topup,session),true);
 for(const patch of [{livemode:false},{amount_total:601},{currency:'ngn'},{payment_status:'unpaid'},{status:'open'},{mode:'subscription'},{id:'cs_live_other'},{client_reference_id:userId},{metadata:{...session.metadata,user_id:tenant}},{metadata:{...session.metadata,tenant_id:userId}},{metadata:{}}])assert.equal(matchesTopup(topup,{...session,...patch}),false,JSON.stringify(patch));
});
test('two distinct confirmation events and a repeated event credit the wallet exactly once',async()=>{
 const db=stateDb();
 for(const eventId of ['evt_first','evt_second','evt_first']){
  await db.query('START TRANSACTION');await acceptTopupEvent(db,tenant,{id:eventId,livemode:true,type:'checkout.session.completed',data:{object:session}});await db.query('COMMIT');
 }
 assert.equal(db.state.balance,725);assert.equal(db.state.updates,1);assert.equal(db.state.topup.status,'paid');assert.equal(db.state.events.size,2);
});
test('unpaid completion does not credit; late success credits once even after failure',async()=>{
 const db=stateDb();await acceptTopupEvent(db,tenant,{id:'evt_pending',livemode:true,type:'checkout.session.completed',data:{object:{...session,payment_status:'unpaid'}}});assert.equal(db.state.balance,125);
 await acceptTopupEvent(db,tenant,{id:'evt_failed',livemode:true,type:'checkout.session.async_payment_failed',data:{object:{...session,payment_status:'unpaid'}}});assert.equal(db.state.topup.status,'failed');assert.equal(db.state.balance,125);
 await acceptTopupEvent(db,tenant,{id:'evt_success',livemode:true,type:'checkout.session.async_payment_succeeded',data:{object:session}});assert.equal(db.state.balance,725);
});
test('mismatched payment rolls back event and ledger; ordinary invoice events are untouched',async()=>{
 const db=stateDb();await db.query('START TRANSACTION');await assert.rejects(acceptTopupEvent(db,tenant,{id:'evt_bad',livemode:true,type:'checkout.session.completed',data:{object:{...session,amount_total:700}}}));await db.query('ROLLBACK');assert.equal(db.state.events.size,0);assert.equal(db.state.credit,null);assert.equal(db.state.balance,125);assert.equal(await acceptTopupEvent(db,tenant,{data:{object:{metadata:{}}}}),false);
});
test('failed balance write rolls back ledger and can be retried',async()=>{
 const db=stateDb(),original=db.query;db.query=async(sql,p)=>{if(sql.startsWith('UPDATE wallet_accounts'))throw Error('write failed');return original(sql,p);};await original('START TRANSACTION');await assert.rejects(creditConfirmedTopup(db,topup,session));await original('ROLLBACK');assert.equal(db.state.credit,null);assert.equal(db.state.balance,125);db.query=original;await creditConfirmedTopup(db,topup,session);assert.equal(db.state.balance,725);
});
test('webhook rejects forged signature before database credit; signed event settles after gateway is disabled',async()=>{
 const db=stateDb(),pool={query:async()=>({rows:[{...gateway,enabled:0}],rowCount:1}),connect:async()=>db};
 const event={id:'evt_signed',livemode:true,type:'checkout.session.completed',data:{object:session}},raw=Buffer.from(JSON.stringify(event)),time=Math.floor(Date.now()/1000),signature=createHmac('sha256','whsec_test123456789').update(time+'.').update(raw).digest('hex');
 const req=header=>Object.assign(Readable.from([raw]),{method:'POST',headers:{'stripe-signature':header}});
 assert.equal((await handleStripeWebhook({req:req('t=0,v1=bad'),path:'/api/webhooks/stripe/'+tenant,pool,send})).status,400);assert.equal(db.state.balance,125);
 assert.equal((await handleStripeWebhook({req:req(`t=${time},v1=${signature}`),path:'/api/webhooks/stripe/'+tenant,pool,send})).status,200);assert.equal(db.state.balance,725);
});
test('server verification reuses the same atomic credit path, never trusts browser status',async()=>{
 const db=stateDb(),pool={query:async()=>({rows:[gateway],rowCount:1}),connect:async()=>db};let fetched;
 const r=await verifyTopup(pool,topup,{fetchImpl:async url=>{fetched=url;return {ok:true,json:async()=>session};}});assert.equal(r.status,'paid');assert.match(fetched,/checkout\/sessions\/cs_live_example$/);assert.equal(db.state.balance,725);
 await verifyTopup(pool,topup,{fetchImpl:async()=>({ok:true,json:async()=>session})});assert.equal(db.state.updates,1);
});
test('user and ordinary admin cannot change top-up controls',async()=>{
 for(const role of ['user','admin'])assert.equal((await handleWalletFundingAdmin({req:{method:'PUT'},path:'/api/admin/wallet-funding',user:{...user,role},pool:{},send})).status,403);
});
test('top-up lookup requires both tenant and user ownership',async()=>{
 let params;const result=await handleWalletFunding({req:{method:'POST'},path:'/api/wallet/topups/'+id+'/verify',user,pool:{query:async(_sql,p)=>{params=p;return {rows:[]};}},send});assert.equal(result.status,404);assert.deepEqual(params,[id,tenant,userId]);
});
test('test Stripe configuration cannot enable spendable wallet funding',async()=>{
 const pool={query:async sql=>({rows:sql.includes('wallet_funding_policy')?[{enabled:1,min_cents:100,max_cents:10000,revision:1}]:[{...gateway,mode:'test'}]})};assert.equal((await fundingCapabilities(pool,tenant)).fundingAvailable,false);
});
test('fractional, negative and oversized amounts are rejected before provider contact',async()=>{
 for(const amountCents of [-1,1.5,1000001])assert.equal((await handleWalletFunding({req:{method:'POST'},path:'/api/wallet/topups',user,pool:{},send,readJson:async()=>({amountCents,idempotencyKey:id})})).status,400);
});
test('balance API separates available funds from call reservations and includes top-up history',async()=>{
 const pool={query:async sql=>({rows:sql.includes('SELECT w.balance_cents')?[{balance_cents:600,currency:'USD',reserved_cents:'250'}]:sql.includes('wallet_topup_credits')?[{id,delta_cents:600,created_at:'2026-10-18'}]:[],rowCount:1})};const result=await handleWallet({req:{method:'GET'},path:'/api/wallet',user,pool,send});assert.equal(result.body.accountBalanceCents,850);assert.equal(result.body.availableBalanceCents,600);assert.equal(result.body.reservedBalanceCents,250);assert.equal(result.body.entries[0].type,'topup');
});
test('checkout retries use the original persisted amount and Stripe idempotency key after timeout',async()=>{
 let persisted=null,providerCalls=0;const keys=[];const db={release(){},query:async(sql,p=[])=>{
  if(sql.startsWith('SELECT email'))return {rows:[{email:'owner@example.test'}]};
  if(sql.startsWith('SELECT * FROM wallet_topups'))return {rows:persisted?[{...persisted}]:[]};
  if(sql.startsWith('INSERT INTO wallet_topups')){persisted={id:p[0],tenant_id:p[1],user_id:p[2],idempotency_key:p[3],amount_cents:p[4],expires_epoch:p[5],status:'creating',currency:'USD'};}
  return {rows:[],rowCount:1};
 }};
 const pool={connect:async()=>db,query:async(sql,p=[])=>{if(sql.includes('wallet_funding_policy'))return {rows:[{enabled:1,min_cents:100,max_cents:100000,revision:1}]};if(sql.includes('payment_gateways'))return {rows:[gateway]};if(sql.startsWith('UPDATE wallet_topups')){persisted.session_id=p[0];persisted.checkout_url=p[1];persisted.status='open';}return {rows:[],rowCount:1};}};
 const fetchImpl=async(_url,options)=>{providerCalls++;keys.push(options.headers['Idempotency-Key']);assert.equal(options.body.get('line_items[0][price_data][unit_amount]'),'600');assert.equal(options.body.get('metadata[tenant_id]'),tenant);if(providerCalls===1)throw Error('ambiguous timeout');return {ok:true,json:async()=>({id:'cs_live_checkout',livemode:true,url:'https://checkout.stripe.com/c/checkout'})};};
 const call=amountCents=>handleWalletFunding({req:{method:'POST'},path:'/api/wallet/topups',user,pool,send,readJson:async()=>({amountCents,idempotencyKey:id}),origin:'https://sip.example.test',fetchImpl});
 assert.equal((await call(600)).status,502);assert.equal(persisted.status,'creating');assert.equal((await call(600)).status,201);assert.equal(keys[0],keys[1]);assert.equal((await call(600)).status,200);assert.equal(providerCalls,2);assert.equal((await call(700)).status,409);
});
test('stale super admin policy update cannot overwrite concurrent changes',async()=>{
 const statements=[],db={release(){},query:async sql=>{statements.push(sql);return {rows:sql.includes('wallet_funding_policy')?[{enabled:0,min_cents:100,max_cents:100000,revision:5}]:[],rowCount:1};}};
 const r=await handleWalletFundingAdmin({req:{method:'PUT'},path:'/api/admin/wallet-funding',user:{...user,role:'super_admin'},pool:{connect:async()=>db},send,readJson:async()=>({enabled:false,minCents:100,maxCents:10000,expectedRevision:4})});assert.equal(r.status,409);assert.equal(statements.includes('ROLLBACK'),true);assert.equal(statements.some(s=>s.startsWith('INSERT INTO wallet_funding_policy')),false);
});
