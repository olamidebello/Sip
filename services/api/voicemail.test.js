import test from 'node:test';
import assert from 'node:assert/strict';
import {lookupVoicemail,validateVoicemail,handleVoicemail,authorizeVoicemailAccess,provisionVoicemail} from './voicemail.js';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',tenant='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const mailbox={mailbox_id:id,enabled:1,revision:2,applied_revision:2};
test('private lookup requires one active, enabled, applied mailbox',async()=>{
 for(const rows of [[],[mailbox,mailbox],[{...mailbox,enabled:0}],[{...mailbox,applied_revision:1}],[{...mailbox,mailbox_id:'bad'}]]){
  const result=await lookupVoicemail({query:async()=>({rows})},{username:'alice',domain:'sip.example.com'});assert.equal(result[0],480);
 }
 let sql,params;const result=await lookupVoicemail({query:async(s,p)=>{sql=s;params=p;return{rows:[mailbox]};}},{username:'alice',domain:'sip.example.com'});
 assert.deepEqual(result,[200,{mailbox:id}]);assert.deepEqual(params,['alice','sip.example.com']);assert.match(sql,/u.tenant_id=a.tenant_id/);assert.match(sql,/m.tenant_id=u.tenant_id/);assert.match(sql,/t.status='active'/);
});
test('invalid lookup identity never reaches database',async()=>{assert.equal((await lookupVoicemail({query:()=>{throw Error('queried');}},{username:'../alice',domain:'sip.example.com'}))[0],400);});
test('mailbox settings require bounded duration and concurrency revision',()=>{for(const input of [{},{enabled:1,maxSeconds:120,revision:1},{enabled:true,maxSeconds:181,revision:1},{enabled:true,maxSeconds:29,revision:1},{enabled:true,maxSeconds:120,revision:0}])assert.throws(()=>validateVoicemail(input));assert.equal(validateVoicemail({enabled:true,maxSeconds:120,revision:1}).maxSeconds,120);});
test('*98 access only resolves the current user SIP account in the tenant',async()=>{let params;const pool={query:async(s,p)=>{params=p;assert.match(s,/tenant_id=\$1 AND user_id=\$2/);return{rows:[{id}]};}};const r=await authorizeVoicemailAccess(pool,{id,tenant_id:tenant},'sip.example.com');assert.equal(r.target,'sip:*98@sip.example.com');assert.deepEqual(params,[tenant,id,'sip.example.com']);assert.equal((await authorizeVoicemailAccess({query:async()=>({rows:[]})},{id,tenant_id:tenant},'foreign.example')).allowed,false);});
async function request(path,role='user',method='GET',pool={query:()=>{throw Error('unexpected query');}},body={}){let result;await handleVoicemail({req:{method},res:{},path,user:{id,tenant_id:tenant,role},pool,readJson:async()=>body,send:(r,code,data)=>result={code,data}});return result;}
test('non-admin users cannot manage or list another user mailbox',async()=>{for(const path of ['/api/admin/voicemail','/api/admin/voicemail/users/'+id,'/api/admin/voicemail/provision'])assert.equal((await request(path)).code,403);});
test('super admin cannot access mailbox in another tenant',async()=>{const r=await request('/api/admin/voicemail/users/'+id,'super_admin','GET',{query:async(sql,params)=>{assert.deepEqual(params,[id,tenant]);return{rows:[]};}});assert.equal(r.code,404);});
test('stale mailbox update rolls back without audit or commit',async()=>{const queries=[];const db={query:async sql=>{queries.push(sql);return{rowCount:0,rows:[]};},release:()=>queries.push('release')};const pool={query:async sql=>({rows:sql.startsWith('SELECT id')?[{id}]:[]}),connect:async()=>db};const r=await request('/api/voicemail','user','PUT',pool,{enabled:false,maxSeconds:60,revision:1});assert.equal(r.code,409);assert.ok(queries.includes('ROLLBACK'));assert.ok(!queries.includes('COMMIT'));assert.ok(!queries.some(s=>s.includes('security_events')));});
test('admin provisioning stays in current tenant',async()=>{let params;await provisionVoicemail({query:async(sql,p)=>{params=p;assert.match(sql,/u.tenant_id=\$1/);}},tenant);assert.deepEqual(params,[tenant]);});
