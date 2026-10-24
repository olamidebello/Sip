import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeAuthorized,validateHostedAccount,handleHostedAccounts} from './hostedAccounts.js';
const token='a'.repeat(64),body={instance:'d4d53e01-a0f6-4dd3-b9e1-b407610a9c89',owner:1,tenant:2,kind:'organization',role:'admin',email:'owner@example.com',password:'x'.repeat(48),company:'Example court'};
function fake({existing=false,collision=false,suspended=false,mismatch=false}={}){
 const writes=[];let tenantId='remote-tenant',userId='remote-user';
 const db={release(){},async query(sql,args=[]){writes.push({sql,args});let rows=[];
 if(sql.includes('GET_LOCK'))rows=[{acquired:1}];
 else if(sql.startsWith('SELECT tenant_id,kind FROM hosted_account_tenants'))rows=existing?[{tenant_id:tenantId,kind:'organization'}]:[];
 else if(sql.startsWith('INSERT INTO tenants'))tenantId=args[0];
 else if(sql.startsWith('SELECT id FROM tenants'))rows=suspended?[]:[{id:tenantId}];
 else if(sql.startsWith('SELECT user_id,tenant_id FROM hosted_accounts'))rows=existing?[{user_id:userId,tenant_id:mismatch?'other':tenantId}]:[];
 else if(sql.startsWith('SELECT id FROM users WHERE email'))rows=collision?[{id:'unrelated-user'}]:[];
 else if(sql.startsWith('INSERT INTO users'))userId=args[0];
 else if(sql.startsWith('SELECT id FROM user_groups'))rows=[{id:'group'}];
 else if(sql.startsWith('SELECT tenant_id FROM users'))rows=[{tenant_id:tenantId}];
 else if(sql.startsWith('SELECT MAX'))rows=[{n:null}];
 return {rows,rowCount:1};}};
 return {writes,pool:{connect:async()=>db,query:async()=>({rows:[{user_status:'active',username:'sip-user',domain:'sip.dobhrap.com',status:'awaiting_switch',extension:'100'}]})}};
}
async function run(options,b=body){const f=fake(options);let response;await handleHostedAccounts({req:{method:'POST',headers:{authorization:'Bearer '+token}},res:{},pool:f.pool,readJson:async()=>b,send:(r,status,data)=>(response={status,data})});return {...f,...response};}
test('bridge requires independent token and validates scoped identity',()=>{process.env.DOBHRAP_BRIDGE_TOKEN=token;delete process.env.SIP_CREDENTIAL_KEY;assert(!bridgeAuthorized({headers:{}}));assert(bridgeAuthorized({headers:{authorization:'Bearer '+token}}));assert.throws(()=>validateHostedAccount({...body,kind:'personal'}));assert.throws(()=>validateHostedAccount({...body,instance:'bad'}));assert.throws(()=>validateHostedAccount({...body,password:'short'}));assert.equal(validateHostedAccount({...body,email:'OWNER@example.com'}).email,'owner@example.com');});
test('organization creates PBX extension with tenant and owner binding',async()=>{const r=await run({});assert.equal(r.status,200);assert.equal(r.data.state,'awaiting_switch');assert.equal(r.data.externalCallsEnabled,false);assert(r.writes.some(q=>q.sql.startsWith('INSERT INTO sip_accounts')));const extension=r.writes.find(q=>q.sql.startsWith('INSERT INTO pbx_destinations'));assert.equal(extension.args[2],'100');assert(r.writes.some(q=>q.sql==='COMMIT'));});
test('retry existing identity never resets password or inserts duplicates',async()=>{const r=await run({existing:true});assert.equal(r.status,200);assert(!r.writes.some(q=>q.sql.startsWith('INSERT ')||q.sql.startsWith('UPDATE users')));});
test('email collision never takes over another user',async()=>{const r=await run({collision:true});assert.equal(r.status,409);assert(!r.writes.some(q=>q.sql.startsWith('INSERT INTO users')));assert(r.writes.some(q=>q.sql==='ROLLBACK'));});
test('suspended workspace and foreign mapping block provisioning',async()=>{for(const options of [{existing:true,suspended:true},{existing:true,mismatch:true}]){const r=await run(options);assert.equal(r.status,409);assert(!r.writes.some(q=>q.sql.startsWith('INSERT INTO users')));}});
test('personal account receives SIP without PBX extension or administrator role',async()=>{const r=await run({},{...body,kind:'personal',role:'user'});assert.equal(r.status,200);assert(!r.writes.some(q=>q.sql.startsWith('INSERT INTO pbx_')));assert.equal(r.writes.find(q=>q.sql.startsWith('INSERT INTO users')).args[6],'user');});
