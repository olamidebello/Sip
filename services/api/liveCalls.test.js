import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {validateCallEvent,handleLiveCallIngest,handleLiveCallsAdmin} from './liveCalls.js';

const secret='k'.repeat(48);
const event=()=>({tenantId:randomUUID(),eventId:randomUUID(),source:'switch-1',legId:'leg-1',
  direction:'outbound',from:'+12125550123',to:'+12125550124',event:'ringing',occurredAt:new Date().toISOString()});
test('validates live call events and requires a real start',()=>{
  const value=event();assert.equal(validateCallEvent(value),value);
  assert.throws(()=>validateCallEvent({...value,from:'sip:attacker@example.com'}));
  assert.throws(()=>validateCallEvent({...value,occurredAt:'2020-01-01T00:00:00Z'}));
});
test('signed event is recorded for an existing tenant; unsigned event is rejected',async()=>{
  const value=event(),raw=JSON.stringify(value),timestamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
  const calls=[],db={query:async(sql,params)=>{calls.push({sql,params});
    if(sql.startsWith('SELECT id FROM tenants'))return {rowCount:1,rows:[{id:value.tenantId}]};
    return {rowCount:0,rows:[]};},release:()=>{}};
  const pool={connect:async()=>db};let response;
  const send=(_res,status,body)=>{response={status,body};};
  const makeReq=headers=>({headers,async *[Symbol.asyncIterator](){yield raw;}});
  const headers={'content-type':'application/json','x-cdr-timestamp':timestamp,'x-cdr-signature':signature};
  await handleLiveCallIngest({req:makeReq({...headers,'x-cdr-signature':'bad'}),res:{},pool,send,keys:{[value.tenantId]:secret}});
  assert.equal(response.status,401);assert.equal(calls.length,0);
  await handleLiveCallIngest({req:makeReq(headers),res:{},pool,send,keys:{[value.tenantId]:secret}});
  assert.equal(response.status,202);assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO live_call_events')));
});
test('live monitor refuses a non-admin before reading a tenant',async()=>{
  let result;await handleLiveCallsAdmin({req:{method:'GET'},res:{},path:'/api/admin/live-calls',user:{role:'user'},
    pool:{query:()=>{throw Error('unexpected query');}},send:(_r,status)=>{result=status;}});
  assert.equal(result,403);
});
