import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDidwwSetup,handleDidwwProvisioning} from './didwwProvisioning.js';
const tenant='11111111-1111-1111-1111-111111111111',user='22222222-2222-2222-2222-222222222222';
const input=()=>({expectedRevision:0,trunkId:'33333333-3333-3333-3333-333333333333',publicIp:'154.29.77.102',host:'nyc.us.out.didww.com',maxConcurrentCalls:10,approvalReference:'DIDWW approval',cliRightsConfirmed:true,assignments:[{userId:user,number:'+12145550123',authorized:true,evidence:'Assigned DID'}]});
test('GUI validates assigned DID policy and binds tenant server-side',()=>{const config=validateDidwwSetup({...input(),tenantId:'attacker'},tenant);assert.equal(config.tenantId,tenant);assert.equal(config.assignments[0].provider,'didww');});
test('GUI rejects missing approvals, unsupported hosts, duplicates and injected secrets',()=>{
 for(const patch of [{cliRightsConfirmed:false},{host:'evil.example'},{apiKey:'key\r\nInjected'},{assignments:[]},{maxConcurrentCalls:0}])assert.throws(()=>validateDidwwSetup({...input(),...patch},tenant));
 const b=input();b.assignments.push({...b.assignments[0]});assert.throws(()=>validateDidwwSetup(b,tenant));
});
test('non-super-admin cannot read or queue DIDWW jobs',async()=>{
 for(const role of ['admin','user'])for(const method of ['GET','PUT','POST']){
  const r=await handleDidwwProvisioning({req:{method},path:'/api/admin/carriers/didww/ip-only',user:{role},pool:{query(){throw Error('No database access allowed');}},send:(_r,code,body)=>({code,body})});assert.equal(r.code,403);
 }
});
test('status never returns a dedicated API key',async()=>{
 const {seal}=await import('./providerCredentials.js');const old=process.env.PROVIDER_CREDENTIAL_KEY;process.env.PROVIDER_CREDENTIAL_KEY='a'.repeat(64);
 const ciphertext=seal({...validateDidwwSetup(input(),tenant),apiKey:'secret-must-not-leak'},Buffer.from('a'.repeat(64),'hex'),tenant,'didww_ip_only');
 const pool={async query(sql){if(sql.startsWith('SELECT ciphertext'))return {rowCount:1,rows:[{enabled:1,ciphertext}]};if(sql.startsWith('SELECT revision'))return {rows:[{revision:1}]};return {rows:[]};}};
 try{const r=await handleDidwwProvisioning({req:{method:'GET'},user:{role:'super_admin',tenant_id:tenant},pool,send:(_r,code,body)=>({code,body})});assert.equal(r.code,200);assert.equal(r.body.apiKeyConfigured,true);assert.ok(!JSON.stringify(r).includes('secret-must-not-leak'));}
 finally{if(old===undefined)delete process.env.PROVIDER_CREDENTIAL_KEY;else process.env.PROVIDER_CREDENTIAL_KEY=old;}
});
