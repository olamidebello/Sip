import test from 'node:test';
import assert from 'node:assert/strict';
import {hostedApp,identity,provisionHostedIdentity} from './hostedApps.js';
const config=JSON.stringify({panel:'a'.repeat(40)});
test('application tokens are scoped and disabled without configuration',()=>{
 assert.equal(hostedApp({headers:{'x-hosted-app':'panel',authorization:'Bearer '+'a'.repeat(40)}},config),'panel');
 for(const headers of [{},{'x-hosted-app':'other',authorization:'Bearer '+'a'.repeat(40)},{'x-hosted-app':'panel',authorization:'Bearer wrong'}])assert.equal(hostedApp({headers},config),null);
 assert.equal(hostedApp({headers:{}},'bad json'),null);
});
test('verified identity and organization binding required',()=>{
 const valid={subject:'42',email:'person@example.com',name:'Person',emailVerified:true,accountType:'individual'};
 assert.equal(identity(valid).accountType,'individual');
 for(const b of [{...valid,emailVerified:false},{...valid,accountType:'super_admin'},{...valid,accountType:'court'}])assert.throws(()=>identity(b));
 assert.equal(identity({...valid,accountType:'court',organizationId:'court-1'}).organizationId,'court-1');
});
test('existing email cannot be claimed or linked through provisioning',async()=>{
 const calls=[],db={release(){},async query(q,p){calls.push(q);if(q.includes('GET_LOCK'))return {rows:[{acquired:1}]};if(q==='SELECT id FROM users WHERE email=$1')return {rows:[{id:'existing'}]};return {rows:[]};}};
 await assert.rejects(provisionHostedIdentity({connect:async()=>db},'panel',{subject:'42',email:'person@example.com',name:'Person',emailVerified:true,accountType:'individual'}),/verified linking/);
 assert(calls.includes('ROLLBACK'));assert(!calls.some(q=>q.startsWith('INSERT INTO users')));assert(calls.some(q=>q.includes('RELEASE_LOCK')));
});
test('retries reuse mapped user and SIP account without creating new rows',async()=>{
 const calls=[],db={release(){},async query(q,p){calls.push(q);
 if(q.includes('GET_LOCK'))return {rows:[{acquired:1}]};
 if(q.startsWith('SELECT user_id,external_workspace'))return {rows:[{user_id:'u1',external_workspace:'org:firm1'}]};
 if(q.startsWith('SELECT u.id,u.tenant_id'))return {rows:[{id:'u1',tenant_id:'t1',status:'active',tenant_status:'active'}]};
 if(q.startsWith('SELECT id,username,status'))return {rows:[{id:'s1',username:'olabc',status:'active'}]};
 return {rows:[]};}};
 const r=await provisionHostedIdentity({connect:async()=>db},'panel',{subject:'42',email:'person@example.com',name:'Person',emailVerified:true,accountType:'business',organizationId:'firm1'});
 assert.equal(r.userId,'u1');assert.equal(r.pbxWorkspace,true);assert.equal(r.sipStatus,'active');assert(!calls.some(q=>q.startsWith('INSERT')));assert(calls.includes('COMMIT'));
});
test('suspended accounts cannot be reactivated by app provisioning',async()=>{
 const db={release(){},async query(q){if(q.includes('GET_LOCK'))return {rows:[{acquired:1}]};if(q.startsWith('SELECT user_id,external_workspace'))return {rows:[{user_id:'u1',external_workspace:'person:42'}]};if(q.startsWith('SELECT u.id,u.tenant_id'))return {rows:[{id:'u1',status:'suspended',tenant_status:'active'}]};return {rows:[]};}};
 await assert.rejects(provisionHostedIdentity({connect:async()=>db},'panel',{subject:'42',email:'p@example.com',name:'Person',emailVerified:true,accountType:'individual'}),/suspended/);
});
test('new organizations receive tenant admin, PBX extension and SIP account atomically',async()=>{
 const calls=[],db={release(){},async query(q,p){calls.push([q,p]);if(q.includes('GET_LOCK'))return {rows:[{acquired:1}]};if(q.startsWith('SELECT u.id,u.tenant_id'))return {rows:[{id:'u1',tenant_id:'t1',status:'active',tenant_status:'active'}]};if(q==='SELECT tenant_id FROM users WHERE id=$1')return {rows:[{tenant_id:'t1'}]};return {rows:[]};}};
 const r=await provisionHostedIdentity({connect:async()=>db},'justisolve',{subject:'u1',email:'person@example.com',name:'Person',emailVerified:true,accountType:'court',organizationId:'court1'});
 assert.equal(r.pbxWorkspace,true);assert.equal(r.sipStatus,'awaiting_switch');
 assert.equal(calls.find(([q])=>q.startsWith('INSERT INTO users'))[1][6],'admin');
 assert(calls.some(([q])=>q.startsWith('INSERT INTO pbx_extensions')));assert(calls.some(([q])=>q.startsWith('INSERT INTO sip_accounts')));assert(calls.some(([q])=>q==='COMMIT'));
});
