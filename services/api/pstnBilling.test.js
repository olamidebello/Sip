import test from 'node:test';
import assert from 'node:assert/strict';
import {callCharge,reservePstn,settlePstn} from './pstnBilling.js';
test('rating applies first/sub intervals and rounds cents once',()=>{
 assert.equal(callCharge('0.010000',0,60,60),0);
 assert.equal(callCharge('0.010000',1,60,60),1);
 assert.equal(callCharge('0.010000',61,60,60),2);
 assert.equal(callCharge('0.005000',120,60,60),1);
 assert.equal(callCharge('0.005000',121,60,60),2);
 assert.equal(callCharge('1.000000',3600,60,60),6000);
 assert.throws(()=>callCharge('-1',10,60,60));
});
test('unsubscribed caller cannot reserve or mutate wallet',async()=>{
 const old=process.env.KAMAILIO_PSTN_ENABLED;process.env.KAMAILIO_PSTN_ENABLED='true';
 const calls=[];const db={query:async(sql)=>{calls.push(sql);return {rows:[],rowCount:0};},release(){}};
 try{const r=await reservePstn({connect:async()=>db},{caller:'ol123',domain:'sip.example',destination:'+15551234567',callKey:'a'.repeat(64)});assert.equal(r[0],403);assert.ok(!calls.some(x=>x.startsWith('UPDATE wallet')));}
 finally{if(old===undefined)delete process.env.KAMAILIO_PSTN_ENABLED;else process.env.KAMAILIO_PSTN_ENABLED=old;}
});
test('settlement rejects untrusted key/event/time formats before connecting',async()=>{
 const pool={connect:()=>{throw Error('must not connect');}};
 assert.equal((await settlePstn(pool,{callKey:'bad',event:'end',epoch:1}))[0],400);
 assert.equal((await settlePstn(pool,{callKey:'a'.repeat(64),event:'end',epoch:Math.floor(Date.now()/1000)+1000}))[0],400);
});

test('settlement refunds only unused reservation and repeated events cannot credit twice',async()=>{
 let balance=20,call={call_key:'b'.repeat(64),user_id:'u',tenant_id:'t',rate:'0.010000',first_interval:60,sub_interval:60,reserved_cents:60,max_seconds:3600,status:'reserved'};
 const events=[],entries=[];
 const db={release(){},query:async(sql,a=[])=>{
  if(sql.startsWith('SELECT * FROM pstn_calls'))return {rows:[{...call}]};
  if(sql.startsWith('INSERT IGNORE INTO pstn_call_events')){if(!events.some(e=>e.event===a[1]))events.push({event:a[1],event_epoch:a[2]});return {};}
  if(sql.startsWith('SELECT event,event_epoch'))return {rows:events};
  if(sql.startsWith('SELECT balance_cents'))return {rows:[{balance_cents:balance}]};
  if(sql.startsWith('UPDATE wallet_accounts')){balance+=a[0];return {};}
  if(sql.startsWith('INSERT INTO pstn_wallet_entries')){entries.push(a);return {};}
  if(sql.includes("SET status='settled'")){call.status='settled';call.charged_cents=a[0];return {};}
  return {rows:[]};
 }};
 const pool={connect:async()=>db};const base={callKey:call.call_key};
 const start=Math.floor(Date.now()/1000)-180;
 assert.equal((await settlePstn(pool,{...base,event:'end',epoch:start+61}))[0],200);
 assert.equal(balance,20); // End arriving before start cannot issue a refund yet.
 const r=await settlePstn(pool,{...base,event:'start',epoch:start});assert.equal(r[1].chargedCents,2);assert.equal(balance,78);
 await settlePstn(pool,{...base,event:'end',epoch:start+61});assert.equal(balance,78);assert.equal(entries.length,1);
});
test('duration beyond reserved budget remains uncharged for reconciliation',async()=>{
 const call={call_key:'c'.repeat(64),rate:'1.000000',first_interval:60,sub_interval:60,max_seconds:60,reserved_cents:100,status:'reserved'};
 const now=Math.floor(Date.now()/1000),events=[{event:'start',event_epoch:now-120},{event:'end',event_epoch:now}];
 const writes=[];const db={release(){},query:async(sql)=>{writes.push(sql);if(sql.startsWith('SELECT *'))return {rows:[call]};if(sql.startsWith('SELECT event'))return {rows:events};return {rows:[]};}};
 const r=await settlePstn({connect:async()=>db},{callKey:call.call_key,event:'end',epoch:now});assert.equal(r[0],409);assert.ok(!writes.some(q=>q.startsWith('UPDATE wallet')));assert.ok(writes.includes('ROLLBACK'));
});
