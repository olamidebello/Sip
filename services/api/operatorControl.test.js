import test from 'node:test';
import assert from 'node:assert/strict';
import {selectQuote,handleOperatorControl} from './operatorControl.js';
const base={number:'+12125550123',at:Date.parse('2026-10-08T12:00:00Z'),mode:'least_cost',
  blocks:[],carriers:[{provider:'flowroute',status:'active',routing_mode:'least_cost'},{provider:'didww',status:'active',routing_mode:'priority'}],
  rates:[
    {id:'a',provider:'flowroute',prefix:'1',cost_cents:1,price_cents:2,priority:1,enabled:true,effective_at:'2026-01-01T00:00:00Z'},
    {id:'b',provider:'didww',prefix:'1212',cost_cents:4,price_cents:6,priority:2,enabled:true,effective_at:'2026-01-01T00:00:00Z'},
    {id:'c',provider:'flowroute',prefix:'1212',cost_cents:5,price_cents:7,priority:1,enabled:true,effective_at:'2026-01-01T00:00:00Z'}]};
test('longest prefix and mode choose eligible carrier',()=>{
  assert.equal(selectQuote(base).selected.id,'b');
  assert.equal(selectQuote({...base,mode:'priority'}).selected.id,'c');
});
test('block and inactive carrier exclude quotes',()=>{
  assert.equal(selectQuote({...base,blocks:[{prefix:'1212',reason:'fraud',enabled:true}]}).blocked,true);
  assert.equal(selectQuote({...base,carriers:[]}).selected,null);
  assert.equal(selectQuote({...base,at:Date.parse('2025-01-01T00:00:00Z')}).selected,null);
});
test('administrator role is required',async()=>{
  let result;await handleOperatorControl({req:{method:'GET'},path:'/api/admin/operator',
    user:{role:'user'},send:(_res,status,body)=>{result={status,body};}});
  assert.equal(result.status,403);
});
