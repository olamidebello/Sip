import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeInventory} from './serviceInventory.js';
test('process health cannot promote call services or expose private fields',()=>{
  const result=sanitizeInventory({schemaVersion:1,checkedAt:new Date().toISOString(),services:[{id:'kamailio',name:'Backend',active:true,transportConnected:true,password:'secret',capabilities:{termination:'tested'}}]});
  assert.equal(result.services[0].active,true);
  assert.equal(result.services[0].capabilities.termination,'pending');
  assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('expired readiness downgrades process and transport states',()=>{
  const result=sanitizeInventory({schemaVersion:1,checkedAt:new Date(Date.now()-240000).toISOString(),services:[{id:'rtpengine',name:'Backend',active:true,transportConnected:true}]});
  assert.equal(result.fresh,false);assert.equal(result.services[0].active,false);assert.equal(result.services[0].transportConnected,false);
});
