import test from 'node:test';
import assert from 'node:assert/strict';
import {syncCarrierProfileForm} from './carrierProfileForm.js';
test('loads saved West trunk and capacity, clearing trunk when switching to an unconfigured provider',()=>{
  const elements=Object.fromEntries(['provider','trunkId','maxConcurrentCalls','routingMode'].map(key=>[key,{value:''}]));
  elements.provider.value='flowroute';elements.trunkId.value='east';
  const profiles=[{provider:'flowroute',trunk_id:'west',max_concurrent_calls:5000,routing_mode:'priority'}];
  syncCarrierProfileForm({elements},profiles);
  assert.equal(elements.trunkId.value,'west');assert.equal(elements.maxConcurrentCalls.value,5000);assert.equal(elements.routingMode.value,'priority');
  elements.provider.value='didww';syncCarrierProfileForm({elements},profiles);
  assert.equal(elements.trunkId.value,'');assert.equal(elements.maxConcurrentCalls.value,10);assert.equal(elements.routingMode.value,'manual');
});
