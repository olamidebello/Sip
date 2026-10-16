import test from 'node:test';
import assert from 'node:assert/strict';
import {handleStoreGateways,matchesPayment,validCheckoutUrl,gatewayCatalog} from './storeGateways.js';
import {seal,unseal} from './providerCredentials.js';
const user={id:'00000000-0000-4000-8000-000000000002',tenant_id:'00000000-0000-4000-8000-000000000003',role:'admin',features:{billing:true}};
const send=(_r,status,body)=>({status,body});
test('checkout rejects credentials in URL, insecure and lookalike hosts',()=>{
 assert.equal(validCheckoutUrl('paystack','https://checkout.paystack.com/abc'),true);
 for(const url of ['http://checkout.paystack.com/a','https://checkout.paystack.com.evil.test/a','https://user@checkout.paystack.com/a','https://checkout.flutterwave.com/a'])assert.equal(validCheckoutUrl('paystack',url),false);
});
test('reconciliation binds exact provider status, reference, amount and currency',()=>{
 const a={id:'reference',amount_cents:995,currency:'USD',provider:'paystack'},d={id:123,reference:'reference',amount:995,currency:'USD',status:'success'};
 assert.ok(matchesPayment(a,d));
 for(const patch of [{reference:'other'},{amount:994},{currency:'NGN'},{status:'pending'},{id:null}])assert.equal(matchesPayment(a,{...d,...patch}),false);
 const f={...a,provider:'flutterwave'},fd={id:1,tx_ref:a.id,amount:9.95,currency:'USD',status:'successful'};assert.ok(matchesPayment(f,fd));assert.equal(matchesPayment(f,{...fd,amount:995}),false);
});
test('gateway ciphertext cannot be copied into another tenant or provider',()=>{
 const key=Buffer.alloc(32,1),cipher=seal({secretKey:'private'},key,user.tenant_id,'paystack');
 assert.equal(unseal(cipher,key,user.tenant_id,'paystack').secretKey,'private');
 assert.throws(()=>unseal(cipher,key,user.id,'paystack'));assert.throws(()=>unseal(cipher,key,user.tenant_id,'flutterwave'));
});
test('unauthorized reseller cannot write gateway credentials',async()=>{
 const r=await handleStoreGateways({req:{method:'PUT'},res:{},path:'/api/admin/marketplace/gateways',user,pool:{query:async()=>({rows:[]})},send});assert.equal(r.status,403);
});
test('gateway admin listing excludes encrypted credentials and scopes tenant',async()=>{
 let query;const r=await handleStoreGateways({req:{method:'GET'},res:{},path:'/api/admin/marketplace/gateways',user:{...user,role:'super_admin'},pool:{query:async(q,a)=>{query=q;assert.deepEqual(a,[user.tenant_id]);return {rows:[]};}},send});assert.equal(r.status,200);assert.doesNotMatch(query,/ciphertext|secret/);assert.equal(r.body.catalog.filter(x=>x.implemented).length,3);
 assert.ok(gatewayCatalog.filter(x=>!x.implemented).length>0);
});
