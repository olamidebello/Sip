import test from 'node:test';
import assert from 'node:assert/strict';
import {availableNumbers,inventorySearch} from './providers.js';

test('inventory filters reject malformed searches and offsets',()=>{
  assert.deepEqual(inventorySearch({prefix:'+1212',offset:'20'}),{prefix:'1212',offset:20,inventoryId:undefined});
  for(const input of [{prefix:'&redirect=x'},{offset:-1},{offset:10001},{offset:1.5},{inventoryId:'../x'}]) assert.throws(()=>inventorySearch(input));
});
test('Flowroute live search uses prefix and offset and exact number revalidation',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const u=new URL(url);assert.equal(u.hostname,'api.flowroute.com');
    assert.equal(u.searchParams.get('starts_with'),'12125550123');
    assert.equal(u.searchParams.get('offset'),'20');assert.equal(options.redirect,'error');
    return {ok:true,json:async()=>({data:[{id:'12125550123',attributes:{value:'12125550123',monthly_cost:1.25,setup_cost:1}}]})};
  });
  const previous=[process.env.FLOWROUTE_ACCESS_KEY,process.env.FLOWROUTE_SECRET_KEY];
  process.env.FLOWROUTE_ACCESS_KEY='test';process.env.FLOWROUTE_SECRET_KEY='test';
  t.after(()=>{for(const [i,key] of ['FLOWROUTE_ACCESS_KEY','FLOWROUTE_SECRET_KEY'].entries()) previous[i]===undefined?delete process.env[key]:process.env[key]=previous[i];});
  const rows=await availableNumbers('flowroute',{prefix:'+12125550123',offset:20});
  assert.equal(rows[0].monthlyCostCents,125);assert.equal(rows[0].setupCostCents,100);
});
test('DIDWW uses documented contains/id filters without unsupported pagination and joins typed SKUs',async t=>{
  const keys=['DIDWW_API_KEY','DIDWW_ACCOUNT_CURRENCY','DIDWW_API_ENV'];const prev=keys.map(k=>process.env[k]);
  keys.forEach((k,i)=>process.env[k]=['test','USD','sandbox'][i]);
  t.after(()=>keys.forEach((k,i)=>prev[i]===undefined?delete process.env[k]:process.env[k]=prev[i]));
  const sku='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';let calls=0;
  t.mock.method(globalThis,'fetch',async(url)=>{
    const u=new URL(url);assert.equal(u.hostname,'sandbox-api.didww.com');
    assert.equal(u.searchParams.has('page[size]'),false);
    if(calls++===0) assert.equal(u.searchParams.get('filter[number_contains]'),'44');
    else assert.equal(u.searchParams.get('filter[id]'),'selected');
    return {ok:true,json:async()=>({data:[{id:'selected',attributes:{number:'442055501234'},relationships:{did_group:{data:{id:sku}}}}],included:[
      {id:sku,type:'did_groups',attributes:{needs_registration:false},relationships:{stock_keeping_units:{data:[{id:sku}]}}},
      {id:sku,type:'stock_keeping_units',attributes:{monthly_price:'2.50',setup_price:'1.00',channels_included_count:2}}
    ]})};
  });
  const rows=await availableNumbers('didww',{prefix:'44'});
  assert.equal(rows[0].skuId,sku);assert.equal(rows[0].monthlyCostCents,250);
  assert.deepEqual(await availableNumbers('didww',{inventoryId:'selected'}),rows);
});
