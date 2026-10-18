import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from './db.js';
import {migrate} from './migrate.js';
import {migratePstnBilling} from './pstnBilling.js';
import {migrateWalletFunding,handleWalletFunding,acceptTopupEvent,verifyTopup} from './walletFunding.js';
import {encryptPaymentSecret} from './stripeGateway.js';
import {handleWallet} from './wallet.js';

test('MySQL migrations, simultaneous confirmations and rechecks credit once',{skip:!process.env.TEST_MYSQL_URL},async()=>{
 const pool=createDatabase(process.env.TEST_MYSQL_URL),tenant=randomUUID(),actor=randomUUID(),other=randomUUID(),requestId=randomUUID();
 const old=process.env.PAYMENT_CONFIG_KEY;process.env.PAYMENT_CONFIG_KEY='34'.repeat(32);
 const user={id:actor,tenant_id:tenant,role:'user',features:{billing:true}},send=(_,status,body)=>({status,body});let session;
 try{
  await migrate(pool);await migratePstnBilling(pool);await migrateWalletFunding(pool);
  await pool.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)',[tenant,'Top-up integration',tenant]);
  await pool.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status) VALUES($1,$2,'Test',$3,'test','test','user','active')",[actor,tenant,actor+'@example.test']);
  await pool.query("INSERT INTO payment_gateways(tenant_id,enabled,mode,secret_key_cipher,webhook_secret_cipher,updated_by) VALUES($1,TRUE,'live',$2,$3,$4)",[tenant,encryptPaymentSecret('sk_live_integration123456'),encryptPaymentSecret('whsec_integration123456'),actor]);
  await pool.query('INSERT INTO wallet_funding_policy(tenant_id,enabled,min_cents,max_cents,updated_by) VALUES($1,TRUE,100,100000,$2)',[tenant,actor]);
  const fetchImpl=async(_url,options)=>{if(options.method==='POST'){const b=options.body;session={object:'checkout.session',id:'cs_live_'+randomUUID().replaceAll('-',''),livemode:true,mode:'payment',status:'complete',payment_status:'paid',client_reference_id:b.get('client_reference_id'),amount_total:600,currency:'usd',metadata:{purpose:'wallet_topup',tenant_id:tenant,user_id:actor},url:'https://checkout.stripe.com/c/test'};}return {ok:true,json:async()=>session};};
  const args={req:{method:'POST'},path:'/api/wallet/topups',user,pool,send,readJson:async()=>({amountCents:600,idempotencyKey:requestId}),origin:'https://sip.example.test',fetchImpl};
  const checkout=await handleWalletFunding(args);assert.equal(checkout.status,201);
  assert.equal((await handleWalletFunding(args)).body.id,checkout.body.id);
  const deliver=async eventId=>{const db=await pool.connect();try{await db.query('START TRANSACTION');await acceptTopupEvent(db,tenant,{id:eventId,livemode:true,type:'checkout.session.completed',data:{object:session}});await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}};
  const t=(await pool.query('SELECT * FROM wallet_topups WHERE id=$1',[checkout.body.id])).rows[0];
  await Promise.all([deliver('evt_'+randomUUID()),deliver('evt_'+randomUUID()),verifyTopup(pool,t,{fetchImpl})]);
  await deliver('evt_'+randomUUID());
  const wallet=await handleWallet({req:{method:'GET'},path:'/api/wallet',user,pool,send});assert.equal(wallet.body.balanceCents,600);assert.equal(wallet.body.entries.filter(e=>e.type==='topup').length,1);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS n FROM wallet_topup_credits WHERE tenant_id=$1',[tenant])).rows[0].n),1);
  const own=await handleWalletFunding({...args,path:'/api/wallet/topups/'+t.id+'/verify',user:{...user,tenant_id:other}});assert.equal(own.status,404);
 }finally{
  for(const table of ['wallet_topup_events','wallet_topup_credits','wallet_topups','wallet_funding_policy','wallet_accounts','payment_gateways'])await pool.query('DELETE FROM '+table+' WHERE tenant_id=$1',[tenant]);
  await pool.query('DELETE FROM users WHERE id=$1',[actor]);await pool.query('DELETE FROM tenants WHERE id=$1',[tenant]);await pool.end();if(old===undefined)delete process.env.PAYMENT_CONFIG_KEY;else process.env.PAYMENT_CONFIG_KEY=old;
 }
});
