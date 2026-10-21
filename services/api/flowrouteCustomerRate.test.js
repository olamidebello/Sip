import test from 'node:test';
import assert from 'node:assert/strict';
import {flowrouteCustomerRate,applyFlowrouteCustomerRate} from './flowrouteCustomerRate.js';
test('carrier cost plus exactly 30 percent at billing precision',()=>{assert.equal(flowrouteCustomerRate('0.010000'),'0.013000');assert.equal(flowrouteCustomerRate('0.008330'),'0.010829');assert.equal(flowrouteCustomerRate('1'),'1.300000');});
test('no double markup; retain carrier intervals and source',()=>{const source={cost_usd_per_minute:'0.01',price_usd_per_minute:'0.013',first_interval:60,sub_interval:6,deck_id:'deck'};const r=applyFlowrouteCustomerRate(source);assert.equal(r.price_usd_per_minute,'0.013000');assert.equal(r.first_interval,60);assert.equal(r.sub_interval,6);assert.equal(r.deck_id,'deck');assert.equal(source.price_usd_per_minute,'0.013');});
test('reject missing, negative, nonfinite and overflowing costs',()=>{for(const r of [null,undefined,'NaN','-1','1e-2','0.1234567','999999.999999'])assert.throws(()=>flowrouteCustomerRate(r));});
test('round micro-dollar price and permit free destinations',()=>{assert.equal(flowrouteCustomerRate('0.000005'),'0.000007');assert.equal(flowrouteCustomerRate('0'),'0.000000');});
