import test from 'node:test';
import assert from 'node:assert/strict';
import {canManageGateway,handleMarketplaceControl,recommendedPlans} from './marketplaceControl.js';
import {handleProductStore} from './productStore.js';
const tenant='00000000-0000-4000-8000-000000000002';
const user={id:tenant,tenant_id:tenant,role:'admin',features:{billing:true}};
const send=(_r,status,body)=>({status,body});
test('gateway delegation requires tenant admin and every authorization flag',async()=>{
 for(const p of [null,{authorized:0,enabled:1,gateway_admin:1},{authorized:1,enabled:0,gateway_admin:1},{authorized:1,enabled:1,gateway_admin:0}])assert.equal(await canManageGateway({query:async(q,args)=>{assert.deepEqual(args,[tenant]);return {rows:p?[p]:[]};}},user),false);
 assert.equal(await canManageGateway({query:async()=>({rows:[{authorized:1,enabled:1,gateway_admin:1}]})},user),true);
 assert.equal(await canManageGateway({}, {...user,role:'user'}),false);
 assert.equal(await canManageGateway({}, {...user,role:'super_admin'}),true);
});
test('reseller cannot authorize itself or enumerate other stores',async()=>{
 const base={res:{},user,send,readJson:async()=>({tenantId:tenant})};
 assert.equal((await handleMarketplaceControl({...base,path:'/api/admin/marketplace/stores',req:{method:'PUT'},pool:{}})).status,403);
 let queried=false;const r=await handleMarketplaceControl({...base,path:'/api/admin/marketplace/stores',req:{method:'GET'},pool:{query:async(q,a)=>{assert.match(q,/WHERE t.id=\$1/);assert.deepEqual(a,[tenant]);queried=true;return {rows:[]};}}});assert.equal(r.status,200);assert.ok(queried);
});
test('suspended store cannot sell or change catalog',async()=>{
 for(const path of ['/api/store/products','/api/admin/store/import-reference']){
 const r=await handleProductStore({req:{method:'GET'},res:{},path,user,pool:{query:async q=>{assert.match(q,/marketplace_stores/);return {rows:[{authorized:1,enabled:0}]};}},send});assert.equal(r.status,403);
 }
});
test('recommended plan import uses own tenant, drafts, and preserves custom prices',async()=>{
 const calls=[];
 const r=await handleMarketplaceControl({req:{method:'POST'},res:{},path:'/api/admin/marketplace/recommended-plans',user:{...user,role:'super_admin'},pool:{query:async(q,a)=>{calls.push([q,a]);return {rowCount:1};}},send});
 assert.equal(r.status,200);assert.equal(calls.length,recommendedPlans.length);
 for(const [q,a] of calls){assert.match(q,/INSERT IGNORE/);assert.match(q,/'draft'/);assert.equal(a[0],tenant);}
});
