import test from 'node:test';
import assert from 'node:assert/strict';
import {handleProviderWebhookAdmin,handleProviderWebhook} from './providerWebhooks.js';
const send=(res,status,body)=>({status,body});
test('non-super administrator cannot create provider callback URL',async()=>{
  const result=await handleProviderWebhookAdmin({req:{method:'POST'},res:{},path:'/api/admin/provider-webhooks',user:{role:'admin'},pool:{},send,readJson:async()=>({})});
  assert.equal(result.status,403);
});
test('unknown provider URL is rejected without ingest',async()=>{
  const result=await handleProviderWebhook({req:{method:'POST'},res:{},path:'/api/webhooks/providers/bad',pool:{},send});
  assert.equal(result.status,404);
});
