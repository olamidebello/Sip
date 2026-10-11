import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceProducts,validateProduct,handleProductStore} from './productStore.js';
test('reference catalog preserves prices and distinct country DIDs',()=>{
 assert.equal(referenceProducts.length,177);assert.equal(new Set(referenceProducts.map(p=>p.sku)).size,177);
 assert.equal(referenceProducts.find(p=>p.name==='Olamide US DID Number').sellingCents,795);
 assert.equal(referenceProducts.find(p=>p.name==='Olamide Canada DID Number').setupCents,995);
 assert.equal(referenceProducts.find(p=>p.sourcePage===10).billing,'annual');
 assert.ok(referenceProducts.every(p=>p.status==='draft'&&Number.isSafeInteger(p.sellingCents)&&p.sellingCents>=0));
});
test('publication requires explicit readiness and meaningful terms',()=>{
 const b={name:'Service',description:'Calling',terms:'',status:'draft',billing:'monthly',sellingCents:1995,resellerCents:1855,setupCents:0};
 assert.ok(validateProduct(b));assert.equal(validateProduct({...b,status:'published'}),false);
 assert.ok(validateProduct({...b,status:'published',terms:'Reviewed destinations and delivery terms.',confirmAvailability:true}));
 assert.equal(validateProduct({...b,sellingCents:-1}),false);assert.equal(validateProduct({...b,sellingCents:1.5}),false);
});
test('consumer catalog never exposes reseller cost',async()=>{
 let sql;await handleProductStore({req:{method:'GET'},res:{},path:'/api/store/products',user:{tenant_id:'tenant',features:{billing:true}},pool:{query:async q=>{sql=q;return {rows:[]};}},send:()=>{}});
 assert.doesNotMatch(sql,/reseller_cents|SELECT \*/);assert.match(sql,/status='published'/);
});
test('billing permission denies all store operations before DB access',async()=>{
 let status;await handleProductStore({req:{method:'POST'},res:{},path:'/api/store/orders',user:{features:{}},pool:{query:()=>{throw Error('must not access');}},send:(_r,s)=>status=s});assert.equal(status,403);
});
