import test from 'node:test';import assert from 'node:assert/strict';import {provisionIcn} from './provisionIcnActivation.mjs';
test('discovers only active paid owners and chooses stable DID without inventing carrier approval',()=>{
 const rows=[{number_e164:'+2342031500002',tenant_id:'t',user_id:'u',purchased:1,tenant_active:1,user_active:1},{number_e164:'+2342031500001',tenant_id:'t',user_id:'u',purchased:1,tenant_active:1,user_active:1},{number_e164:'+2342031500000',tenant_id:'other',user_id:'v',purchased:0,tenant_active:1,user_active:1}];
 const r=provisionIcn(rows);assert.deepEqual(r.icn_activation.tenants,['t']);assert.equal(r.icn_activation.preferredDids.u,'+2342031500001');assert.equal(r.icn_activation.carrierApproved,false);assert.deepEqual(r.provisioning.missing,['carrier_approval','carrier_caller_id_format','reviewed_tariff_prefixes']);
});
test('preserves explicit scope, preferences and approved carrier settings',()=>{
 const saved={tenants:['chosen'],preferredDids:{u:'selected'},carrierApproved:true,approvalReference:'ticket',callerIdFormat:'domestic',prefixes:[{prefix:'23480',category:'gsm'}]};const r=provisionIcn([],saved);assert.deepEqual(r.icn_activation.tenants,['chosen']);assert.equal(r.icn_activation.preferredDids.u,'selected');assert.deepEqual(r.provisioning.missing,[]);
});
