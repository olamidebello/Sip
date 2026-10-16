import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from './db.js';
import {migrate} from './migrate.js';
import {handleStoreGateways} from './storeGateways.js';
import {handleMarketplaceControl} from './marketplaceControl.js';
test('MySQL reseller checkout and verification preserve tenant boundaries',{skip:!process.env.TEST_MYSQL_URL},async()=>{
 const pool=createDatabase(process.env.TEST_MYSQL_URL),tenant=randomUUID(),other=randomUUID(),actor=randomUUID();
 const user={id:actor,tenant_id:tenant,role:'admin',features:{billing:true}},send=(_r,status,body)=>({status,body});
 const previous=process.env.PAYMENT_CONFIG_KEY;process.env.PAYMENT_CONFIG_KEY='12'.repeat(32);
 let latestReference,provider;
 const fetchImpl=async(url,options)=>{
  if(options.method==='POST'){
   const b=JSON.parse(options.body);latestReference=b.reference||b.tx_ref;
   return {ok:true,json:async()=>({status:provider==='paystack'?true:'success',data:provider==='paystack'?{authorization_url:'https://checkout.paystack.com/test'}:{link:'https://checkout.flutterwave.com/test'}})};
  }
  return {ok:true,json:async()=>({status:provider==='paystack'?true:'success',data:provider==='paystack'?{id:123,reference:latestReference,amount:995,currency:'USD',status:'success'}:{id:456,tx_ref:latestReference,amount:9.95,currency:'USD',status:'successful'}})};
 };
 const call=(method,path,body,who=user)=>handleStoreGateways({req:{method},res:{},path,user:who,pool,send,readJson:async()=>body,origin:'https://sip.example.test',fetchImpl});
 try{
  await migrate(pool);
  for(const id of [tenant,other])await pool.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)',[id,'Gateway test',id]);
  await pool.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status) VALUES($1,$2,'Gateway test',$3,'test','test','admin','active')",[actor,tenant,actor+'@example.test']);
  assert.equal((await call('PUT','/api/admin/marketplace/gateways',{provider:'paystack',enabled:true,environment:'test',secretKey:'sk_test_example123456789'})).status,403);
  await handleMarketplaceControl({req:{method:'PUT'},res:{},path:'/api/admin/marketplace/stores',user:{...user,role:'super_admin'},pool,send,readJson:async()=>({tenantId:tenant,name:'Test store',authorized:true,enabled:true,gatewayAdmin:true})});
  for(provider of ['paystack','flutterwave']){
   assert.equal((await call('PUT','/api/admin/marketplace/gateways',{provider,enabled:true,environment:'test',secretKey:provider==='paystack'?'sk_test_example123456789':'FLWSECK_TEST-example123456789'})).status,200);
   const invoice=randomUUID();await pool.query("INSERT INTO invoices(id,user_id,description,amount_cents,currency,status) VALUES($1,$2,'Checkout test',995,'USD','unpaid')",[invoice,actor]);
   const checkout=await call('POST','/api/marketplace/checkout',{provider,invoiceId:invoice});assert.equal(checkout.status,201);
   assert.equal((await call('POST','/api/marketplace/checkout',{provider,invoiceId:invoice})).status,409);
   assert.equal((await call('POST','/api/marketplace/verify',{attemptId:checkout.body.attemptId},{...user,tenant_id:other})).status,404);
   const verify=await call('POST','/api/marketplace/verify',{attemptId:checkout.body.attemptId});assert.equal(verify.status,200);
   assert.equal((await call('POST','/api/marketplace/verify',{attemptId:checkout.body.attemptId})).body.status,'paid');
   assert.equal((await pool.query('SELECT status FROM invoices WHERE id=$1',[invoice])).rows[0].status,'paid');
  }
  assert.deepEqual((await call('GET','/api/admin/marketplace/gateways',null,{...user,tenant_id:other})).body.gateways,[]);
 }finally{
  if(previous===undefined)delete process.env.PAYMENT_CONFIG_KEY;else process.env.PAYMENT_CONFIG_KEY=previous;
  await pool.query('DELETE FROM payment_attempts WHERE tenant_id=$1',[tenant]);
  await pool.query('DELETE FROM invoices WHERE user_id=$1',[actor]);
  await pool.query('DELETE FROM store_gateways WHERE tenant_id=$1',[tenant]);
  await pool.query('DELETE FROM marketplace_stores WHERE tenant_id=$1',[tenant]);
  await pool.query('DELETE FROM security_events WHERE tenant_id=$1',[tenant]);
  await pool.query('DELETE FROM users WHERE id=$1',[actor]);
  await pool.query('DELETE FROM tenants WHERE id IN ($1,$2)',[tenant,other]);await pool.end();
 }
});
