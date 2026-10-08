import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFlowroute, handleFlowrouteWebhook } from './messagingWebhooks.js';

const payload = {data:{type:'message',id:'mdr2-a123',attributes:{from:'+12065550100',to:'+12065550101',body:'Hello',is_mms:false,timestamp:'2026-10-06T14:00:00Z'}}};
test('normalizes Flowroute SMS and receipt levels independently',()=>{
  assert.equal(normalizeFlowroute('sms',payload).body,'Hello');
  const receipt={data:{type:'delivery_receipt',id:'mdr2-a123',attributes:{from:'+12065550101',to:'+12065550100',body:'Hello',level:2,status:'delivered'}}};
  assert.equal(normalizeFlowroute('sms-dlr',receipt).level,2);
  assert.throws(()=>normalizeFlowroute('sms-dlr',{...receipt,data:{...receipt.data,attributes:{...receipt.data.attributes,level:3}}}),/level/);
});
test('drops expiring MMS signed media URLs while preserving metadata',()=>{
  const mms={...payload,data:{...payload.data,attributes:{...payload.data.attributes,is_mms:true}},included:[{id:'abc',attributes:{file_name:'photo.jpg',mime_type:'image/jpeg',file_size:123,url:'https://private.example/secret'}}]};
  const normalized=normalizeFlowroute('mms',mms);
  assert.equal(normalized.media[0].name,'photo.jpg');
  assert.equal(JSON.stringify(normalized).includes('private.example'),false);
});
test('rejects unauthenticated webhook before reading or writing',async()=>{
  process.env.FLOWROUTE_WEBHOOK_TOKEN='a'.repeat(64);
  let result;
  await handleFlowrouteWebhook({req:{method:'POST'},res:{},path:'/api/webhooks/flowroute/invalid/sms',pool:{query(){throw Error('DB should not be queried');}},send(_res,status,body){result={status,body};}});
  assert.equal(result.status,404);
  delete process.env.FLOWROUTE_WEBHOOK_TOKEN;
});
