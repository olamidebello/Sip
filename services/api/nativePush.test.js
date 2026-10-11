import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createVerify} from 'node:crypto';
import {handleNativePush,pushHookAuthorized,serviceAccountAssertion,pushMessage} from './nativePush.js';
const user={id:'user',tenant_id:'tenant'};
async function invoke({path='/api/native-push/device',method='POST',body={token:'device-token-123456789012345'},rows=()=>[],headers={}}={}){
 const queries=[];let response;await handleNativePush({path,req:{method,headers},user,pool:{query:async(sql,params)=>{queries.push({sql,params});const r=rows(sql);return {rows:r,rowCount:r.length};}},readJson:async()=>body,sessionHash:'session-hash',send:(_,status,body)=>{response={status,body};}});return {...response,queries};
}
test('trusted push hook rejects missing, wrong and short secrets',()=>{
 const old=process.env.NATIVE_PUSH_HOOK_TOKEN;try{process.env.NATIVE_PUSH_HOOK_TOKEN='a'.repeat(64);assert.equal(pushHookAuthorized({headers:{}}),false);assert.equal(pushHookAuthorized({headers:{authorization:'Bearer '+ 'b'.repeat(64)}}),false);assert.equal(pushHookAuthorized({headers:{authorization:'Bearer '+ 'a'.repeat(64)}}),true);}finally{if(old===undefined)delete process.env.NATIVE_PUSH_HOOK_TOKEN;else process.env.NATIVE_PUSH_HOOK_TOKEN=old;}
});
test('device is bound to authenticated user tenant and session; token never returned',async()=>{
 const old=process.env.NATIVE_PUSH_SERVICE_ACCOUNT_FILE;process.env.NATIVE_PUSH_SERVICE_ACCOUNT_FILE='/private/fixture';try{const r=await invoke();assert.equal(r.status,200);assert.deepEqual(r.queries[0].params.slice(1),['user','tenant','device-token-123456789012345','session-hash','android']);assert.equal(r.body.token,undefined);}finally{if(old===undefined)delete process.env.NATIVE_PUSH_SERVICE_ACCOUNT_FILE;else process.env.NATIVE_PUSH_SERVICE_ACCOUNT_FILE=old;}
});
test('push wake is authenticated and suppresses DND recipients',async()=>{
 assert.equal((await invoke({path:'/api/native-push/wake'})).status,403);
 const old=process.env.NATIVE_PUSH_HOOK_TOKEN;process.env.NATIVE_PUSH_HOOK_TOKEN='x'.repeat(64);try{const r=await invoke({path:'/api/native-push/wake',headers:{authorization:'Bearer '+process.env.NATIVE_PUSH_HOOK_TOKEN},body:{username:'oluser',domain:'sip.example',callId:'call'},rows:sql=>sql.includes('SELECT a.user_id')?[{user_id:'peer',tenant_id:'tenant',presence:'dnd'}]:[]});assert.equal(r.status,404);assert.equal(r.queries.length,1);}finally{if(old===undefined)delete process.env.NATIVE_PUSH_HOOK_TOKEN;else process.env.NATIVE_PUSH_HOOK_TOKEN=old;}
});
test('OAuth assertion has verified signature, fixed Google audience and short expiry',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});const jwt=serviceAccountAssertion({client_email:'service@example.org',private_key:privateKey},1000);const [header,claims,signature]=jwt.split('.');assert.equal(createVerify('RSA-SHA256').update(header+'.'+claims).verify(publicKey,Buffer.from(signature,'base64url')),true);const payload=JSON.parse(Buffer.from(claims,'base64url'));assert.equal(payload.exp-payload.iat,3600);assert.equal(payload.aud,'https://oauth2.googleapis.com/token');
 const message=pushMessage('token',{kind:'incoming_call'}).message;assert.equal(message.android.priority,'high');assert.equal(message.android.ttl,'45s');assert.equal(message.data.password,undefined);
});
test('SIP wake decodes the registrar Call-ID before queuing native actions',async()=>{
 const old=process.env.NATIVE_PUSH_HOOK_TOKEN;process.env.NATIVE_PUSH_HOOK_TOKEN='x'.repeat(64);try{const r=await invoke({path:'/api/native-push/wake',headers:{authorization:'Bearer '+process.env.NATIVE_PUSH_HOOK_TOKEN},body:{username:'oluser',domain:'sip.example',callIdEncoding:'base64',callId:Buffer.from('dialog@example').toString('base64')},rows:sql=>sql.includes('SELECT a.user_id')?[{user_id:'peer',tenant_id:'tenant'}]:sql.includes('SELECT id FROM')?[{id:'device'}]:[]});assert.equal(r.status,202);const insert=r.queries.find(q=>q.sql.includes('INSERT IGNORE'));assert.equal(JSON.parse(insert.params[3]).callId,'dialog@example');}finally{if(old===undefined)delete process.env.NATIVE_PUSH_HOOK_TOKEN;else process.env.NATIVE_PUSH_HOOK_TOKEN=old;}
});
test('iOS device registration requires its provider config and rejects invalid platform',async()=>{
 const old=process.env.NATIVE_PUSH_APNS_CONFIG_FILE;delete process.env.NATIVE_PUSH_APNS_CONFIG_FILE;try{assert.equal((await invoke({body:{platform:'ios',token:'a'.repeat(64)}})).status,503);process.env.NATIVE_PUSH_APNS_CONFIG_FILE='/private/apns';const r=await invoke({body:{platform:'ios',token:'a'.repeat(64)}});assert.equal(r.status,200);assert.equal(r.queries[0].params[5],'ios');assert.equal((await invoke({body:{platform:'unknown',token:'a'.repeat(64)}})).status,400);}finally{if(old===undefined)delete process.env.NATIVE_PUSH_APNS_CONFIG_FILE;else process.env.NATIVE_PUSH_APNS_CONFIG_FILE=old;}
});
