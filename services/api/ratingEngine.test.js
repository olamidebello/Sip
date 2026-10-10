import test from 'node:test';
import assert from 'node:assert/strict';
import {rateCall} from './ratingEngine.js';
import {reconcileCarrier} from './carrierReconciliation.js';

test('rates only started minute units in integer cents',()=>{
  assert.deepEqual(rateCall({billableSeconds:0,priceCents:3,costCents:2}),
    {units:0,chargeCents:0,costTotalCents:0,marginCents:0});
  assert.deepEqual(rateCall({billableSeconds:61,priceCents:3,costCents:2}),
    {units:2,chargeCents:6,costTotalCents:4,marginCents:2});
  assert.throws(()=>rateCall({billableSeconds:-1,priceCents:3,costCents:2}),RangeError);
});

test('carrier reconciliation requires both statement and rated cost equality',()=>{
  assert.equal(reconcileCarrier({expectedCents:100,carrierCents:100,ratedCostCents:100}).matched,true);
  assert.deepEqual(reconcileCarrier({expectedCents:100,carrierCents:101,ratedCostCents:99}),
    {statementVarianceCents:1,ratedVarianceCents:2,matched:false});
});
