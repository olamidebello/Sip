import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {seal} from './providerCredentials.js';
import {validFlutterwaveHash,handleFlutterwaveWebhook} from './flutterwaveWebhook.js';
const tenant='00000000-0000-4000-8000-000000000002', secret='a'.repeat(64);
const send=(_,status,body)=>({status,body});
test('V3 hash requires a configured strong secret and exact match',()=>{
 assert.equal(validFlutterwaveHash(secret,secret),true);
 for(const value of [undefined,'',secret+'x','b'.repeat(64)])assert.equal(validFlutterwaveHash(value,secret),false);
 assert.equal(validFlutterwaveHash('short','short'),false);
});
async function invoke(payload,{hash=secret,attempt}={}){
 process.env.PROVIDER_CREDENTIAL_KEY='1'.repeat(64);
 const req=Readable.from([Buffer.from(typeof payload==='string'?payload:JSON.stringify(payload))]);
 req.method='POST';req.headers={'verif-hash':hash};
 let calls=0;
 const pool={query:async(sql)=>{
 calls++;
 if(sql.includes('provider_api_credentials'))return {rowCount:1,rows:[{enabled:true,ciphertext:seal({webhookSecret:secret},Buffer.from(process.env.PROVIDER_CREDENTIAL_KEY,'hex'),tenant,'flutterwave')}]};
 return {rows:attempt?[attempt]:[]};
 }};
 const result=await handleFlutterwaveWebhook({req,path:'/api/webhooks/flutterwave/'+tenant,pool,send,fetchImpl:()=>{throw Error('unexpected provider call');}});
 return {...result,calls};
}
test('unauthenticated payload cannot query a payment',async()=>{const r=await invoke({}, {hash:'wrong'});assert.equal(r.status,401);assert.equal(r.calls,1);});
test('malformed JSON is rejected',async()=>{assert.equal((await invoke('{')).status,400);});
test('failed and unrelated charges are acknowledged without settlement',async()=>{
 assert.equal((await invoke({event:'charge.completed',data:{status:'failed'}})).calls,1);
 const r=await invoke({event:'charge.completed',data:{status:'successful',tx_ref:tenant}});
 assert.equal(r.status,200);assert.equal(r.body.ignored,true);
});
test('paid attempts acknowledge retries without re-verification',async()=>{
 const r=await invoke({event:'charge.completed',data:{status:'successful',tx_ref:tenant}},{attempt:{status:'paid'}});
 assert.equal(r.status,200);assert.equal(r.body.duplicate,true);
});
