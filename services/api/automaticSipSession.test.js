import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticSipSession,encrypt} from './sipMarketplace.js';
const user={id:'user',tenant_id:'tenant'};
test('session SIP provisioning scopes credentials to owner and tenant and releases its lock',async()=>{
 const old=process.env.SIP_CREDENTIAL_KEY;process.env.SIP_CREDENTIAL_KEY='ab'.repeat(32);const cipher=encrypt('private-sip-secret',Buffer.from(process.env.SIP_CREDENTIAL_KEY,'hex'));const queries=[];let released=false;
 const db={query:async(sql,params)=>{queries.push({sql,params});const rows=sql.includes('tenant_settings')?[{value:'wss://transport.example/ws'}]:sql.includes('GET_LOCK')?[{acquired:1}]:sql.includes('SELECT u.tenant_id')?[{tenant_id:'tenant'}]:sql.includes('SELECT id,username,status')?[{id:'sip',status:'active'}]:sql.includes('SELECT username,domain,status')?[{username:'oluser',domain:'sip.example',status:'active',secret_cipher:cipher}]:[];return {rows,rowCount:rows.length};},release(){released=true;}};
 try{const result=await automaticSipSession({connect:async()=>db},user);assert.equal(result.password,'private-sip-secret');assert.equal(result.wssUrl,'wss://transport.example/ws');assert.equal(result.aor,'sip:oluser@sip.example');const query=queries.find(q=>q.sql.includes('SELECT username,domain,status'));assert.deepEqual(query.params,['user','tenant']);assert.ok(queries.some(q=>q.sql.includes('RELEASE_LOCK')));assert.equal(released,true);}finally{if(old===undefined)delete process.env.SIP_CREDENTIAL_KEY;else process.env.SIP_CREDENTIAL_KEY=old;}
});
test('missing encryption configuration fails closed without exposing credentials',async()=>{
 const old=process.env.SIP_CREDENTIAL_KEY;delete process.env.SIP_CREDENTIAL_KEY;try{assert.equal((await automaticSipSession({},user)).status,'pending');}finally{if(old!==undefined)process.env.SIP_CREDENTIAL_KEY=old;}
});
