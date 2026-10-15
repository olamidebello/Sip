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
test('reservation applies normalization, account price, international budget and shadow snapshot together',async()=>{
 const {mkdtemp,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const root=await mkdtemp(join(tmpdir(),'olamide-billing-test-')),tenant='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002';
 const saved={enabled:process.env.KAMAILIO_PSTN_ENABLED,file:process.env.OUTBOUND_DID_POLICY_FILE};process.env.KAMAILIO_PSTN_ENABLED='true';process.env.OUTBOUND_DID_POLICY_FILE=join(root,'outbound.json');
 await writeFile(process.env.OUTBOUND_DID_POLICY_FILE,JSON.stringify({version:1,tenants:{[tenant]:{didww:{ipOnlyApproved:true,allowedIpConfirmed:true,cliAuthorized:true,host:'nyc.us.out.didww.com',maxConcurrentCalls:5},assignments:[{userId:user,number:'+15551234567',provider:'didww',authorized:true,evidence:'Test fixture'}]}}}));
 const policies=[['normalization',{prefix:'0',replacement:'234'}],['personal-rates',{userId:user,prefix:'234',rate:'1.000000',first:60,step:60}],['international-credit',{userId:user,homePrefix:'1',limitCents:500}],['shadow-rates',{prefix:'234',rate:'2.000000',first:60,step:60}]].map(([kind,data])=>({id:kind,kind,data,enabled:1,revision:1}));
 const calls=[],db={release(){},async query(sql,args=[]){calls.push({sql,args});
  if(sql.startsWith('SELECT tenant_id,user_id'))return {rows:[{tenant_id:tenant,user_id:user,external_calls:1}]};
  if(sql.startsWith('SELECT GET_LOCK'))return {rows:[{acquired:1}]};
  if(sql.startsWith('SELECT p.id,p.kind'))return {rows:policies};
  if(sql.startsWith('SELECT balance_cents,currency'))return {rows:[{balance_cents:10000,currency:'USD'}]};
  if(sql.startsWith('SELECT COUNT'))return {rows:[{n:0}]};
  if(sql.startsWith('SELECT r.*'))return {rows:[{price_usd_per_minute:'0.100000',first_interval:60,sub_interval:60}]};
  if(sql.startsWith('SELECT COALESCE(SUM(CASE'))return {rows:[{cents:200}]};
  return {rows:[],rowCount:0};}};
 try{const result=await reservePstn({connect:async()=>db},{caller:'subscriber',domain:'sip.example',destination:'08012345678',callKey:'d'.repeat(64)});assert.equal(result[0],200,JSON.stringify(result));assert.equal(result[1].normalizedDestination,'2348012345678');assert.equal(result[1].maxSeconds,180);const insert=calls.find(c=>c.sql.startsWith('INSERT INTO pstn_calls'));assert.equal(insert.args[4],'1.000000');assert.equal(insert.args[7],300);assert.ok(calls.some(c=>c.sql.startsWith('UPDATE pstn_calls SET shadow_policy_id')));assert.equal(calls.find(c=>c.sql.startsWith('UPDATE wallet')).args[0],300);}
 finally{for(const [key,value] of [['KAMAILIO_PSTN_ENABLED',saved.enabled],['OUTBOUND_DID_POLICY_FILE',saved.file]])if(value===undefined)delete process.env[key];else process.env[key]=value;await rm(root,{recursive:true,force:true});}
});
