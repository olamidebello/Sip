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
function bulkFixture(body,rows={}){
 const calls=[];const db={query:async(sql,args)=>{calls.push([sql,args]);return sql.startsWith('SELECT revision')?{rows:rows[args[1]]?[rows[args[1]]]:[]}:{rowCount:1,rows:[]};},release(){calls.push(['release']);}};
 const opts={req:{method:'POST'},user:{id:'actor',tenant_id:'tenant',role:'super_admin',features:{billing:true}},pool:{query:async()=>({rowCount:0,rows:[]}),connect:async()=>db},readJson:async()=>body,send:(_r,status,body)=>({status,body})};
 return {opts,calls};
}
const imported={sku:'CUSTOM-001',name:'Service',category:'Services',description:'Description',terms:'',billing:'monthly',sellingCents:1995,resellerCents:1500,setupCents:0};
test('bulk import validates all rows before writing and forces drafts',async()=>{
 const bad=bulkFixture({products:[imported,{...imported,sku:'OTHER',sellingCents:-1}]});
 assert.equal((await handleProductStore({...bad.opts,path:'/api/admin/store/import'})).status,400);assert.equal(bad.calls.length,0);
 const good=bulkFixture({products:[{...imported,status:'published'}]});const r=await handleProductStore({...good.opts,path:'/api/admin/store/import'});
 assert.equal(r.body.imported,1);const insert=good.calls.find(([q])=>q.startsWith('INSERT IGNORE'));assert.match(insert[0],/'draft'/);assert.equal(insert[1][0],'tenant');assert.ok(good.calls.some(([q])=>q==='COMMIT'));
});
test('bulk status rolls back previous updates on stale revision',async()=>{
 const fixture=bulkFixture({products:[{sku:'A',revision:1},{sku:'B',revision:1}],status:'archived'},{A:{revision:1,terms:''},B:{revision:2,terms:''}});
 const r=await handleProductStore({...fixture.opts,path:'/api/admin/store/products/bulk'});assert.equal(r.status,409);assert.ok(fixture.calls.some(([q])=>q==='ROLLBACK'));assert.ok(!fixture.calls.some(([q])=>q==='COMMIT'));
});
test('bulk publishing requires terms and readiness; admin role is enforced',async()=>{
 const fixture=bulkFixture({products:[{sku:'A',revision:1}],status:'published',confirmAvailability:true},{A:{revision:1,terms:''}});
 assert.equal((await handleProductStore({...fixture.opts,path:'/api/admin/store/products/bulk'})).status,400);
 fixture.opts.user.role='user';assert.equal((await handleProductStore({...fixture.opts,path:'/api/admin/store/import'})).status,403);
});
test('bulk status succeeds with tenant scoped updates and audit',async()=>{
 const fixture=bulkFixture({products:[{sku:'A',revision:1}],status:'published',confirmAvailability:true},{A:{revision:1,terms:'Reviewed delivery and refund terms.'}});
 const r=await handleProductStore({...fixture.opts,path:'/api/admin/store/products/bulk'});assert.equal(r.status,200);assert.equal(r.body.updated,1);
 const update=fixture.calls.find(([q])=>q.startsWith('UPDATE store_products'));assert.deepEqual(update[1],['published','tenant','A']);assert.ok(fixture.calls.some(([q])=>q.includes('security_events')));
});
