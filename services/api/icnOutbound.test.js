import test from 'node:test';import assert from 'node:assert/strict';
import {validateIcnOutbound,icnTariff,reserveIcnOutbound} from './icnOutbound.js';
const tenant='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
const config={version:1,enabled:true,carrierApproved:true,approvalReference:'ICN approval ticket',callerIdFormat:'domestic',firstInterval:60,nextInterval:60,maxSeconds:120,maxConcurrent:1,tenants:[tenant],prefixes:[{prefix:'2342',category:'other'},{prefix:'23480',category:'gsm'}]};
test('tariffs use longest reviewed prefix, supplied NGN prices and fresh FX',()=>{
 validateIcnOutbound(config);const fx={ngn_per_usd:1600,observed_at:new Date()};assert.equal(icnTariff('2348012345678',config,fx).rate,'0.005000');assert.equal(icnTariff('2342012345678',config,fx).sellNgn,10);
 assert.throws(()=>icnTariff('2349012345678',config,fx),/prefix/);assert.throws(()=>icnTariff('2348012345678',config,{...fx,observed_at:new Date(0)}),/Fresh/);assert.throws(()=>validateIcnOutbound({...config,carrierApproved:false}));
});
function fixture({balance=100,rental='active',paidUntil=new Date(Date.now()+86400000),existing=null,count=0}={}){
 const writes=[];const db={async query(sql,args=[]){
  if(sql.startsWith('SELECT d.id'))return {rows:[{id:'did',purchased:1,number_e164:'+2342031500001',status:'assigned',rental_status:rental,paid_until:paidUntil,policy:{geofenceEnabled:true,voiceReady:true,interconnects:['icn']}}]};
  if(sql.startsWith('SELECT balance'))return {rows:[{currency:'USD',balance_cents:balance}]};
  if(sql.startsWith('SELECT * FROM pstn_calls'))return {rows:existing?[existing]:[]};
  if(sql.startsWith('SELECT 1 FROM operator'))return {rows:[]};
  if(sql.startsWith('SELECT COUNT'))return {rows:[{n:count}]};
  if(sql.startsWith('SELECT ngn_per'))return {rows:[{ngn_per_usd:1600,observed_at:new Date()}]};
  writes.push([sql,args]);return {rows:[],rowCount:1};
 }};return {db,writes};
}
// Same integer ceiling as production callCharge for this exact .005 USD tariff.
const context={actor:{tenant_id:tenant,user_id:user},data:{callKey:'a'.repeat(64)},destination:'2348012345678',policies:[],charge:(rate,seconds,first,step)=>Math.ceil(Number(rate)*Math.max(first,Math.ceil(seconds/step)*step)/60*100),assertWindow(){},allowance:async()=>Infinity};
test('reservation atomically snapshots DID and FX and debits only once on replay',async()=>{
 const f=fixture(),options={config,access:async()=>{}};const r=await reserveIcnOutbound(f.db,context,options);assert.equal(r[1].provider,'icn');assert.equal(r[1].icnDestination,'08012345678');assert.equal(r[1].icnCallerId,'02031500001');assert.equal(f.writes.filter(([s])=>s.startsWith('UPDATE wallet')).length,1);assert.equal(f.writes.find(([s])=>s.startsWith('INSERT INTO icn_call'))[1][5],1600);
 const existing={tenant_id:tenant,user_id:user,destination:context.destination,caller_id:'+2342031500001',provider:'icn',status:'reserved',max_seconds:120};const replay=fixture({existing});await reserveIcnOutbound(replay.db,context,options);assert.deepEqual(replay.writes.map(([s])=>s),['COMMIT']);
 await assert.rejects(()=>reserveIcnOutbound(fixture({existing:{...existing,user_id:'another'}}).db,context,options),/reuse/);
});
test('expired, suspended, insufficient, over-capacity and denied location calls do not debit',async()=>{
 for(const state of [{rental:'suspended'},{paidUntil:new Date(0)},{balance:0},{count:1}]){const f=fixture(state);await assert.rejects(()=>reserveIcnOutbound(f.db,context,{config,access:async()=>{}}));assert.equal(f.writes.length,0);}
 const f=fixture();await assert.rejects(()=>reserveIcnOutbound(f.db,context,{config,access:async()=>{throw Error('Outside geofence');}}),/geofence/);assert.equal(f.writes.length,0);
});
