// Exercise the real existing settlement function; isolate its unrelated import
// graph so this regression test also runs in the deployment container.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const src=fs.readFileSync(new URL('./pstnBilling.js',import.meta.url),'utf8');
const start=src.indexOf('export async function settlePstn('),chargeStart=src.indexOf('export function callCharge('),chargeEnd=src.indexOf('export async function migratePstnBilling(');
assert.ok(start>0&&chargeStart>=0&&chargeEnd>chargeStart);
const {settlePstn}=await import('data:text/javascript;base64,'+Buffer.from(src.slice(chargeStart,chargeEnd)+src.slice(start)).toString('base64'));
function fixture(){
 const events=new Map(),ledger=new Set();let balance=98;
 const call={call_key:'a'.repeat(64),tenant_id:'tenant',user_id:'owner',provider:'icn',rate:'0.005000',first_interval:60,sub_interval:60,max_seconds:240,reserved_cents:2,status:'reserved'};
 const db={release(){},async query(sql,args=[]){
  if(sql.startsWith('SELECT * FROM pstn_calls'))return {rows:[{...call}]};
  if(sql.startsWith('INSERT IGNORE INTO pstn_call_events')){if(!events.has(args[1]))events.set(args[1],args[2]);}
  else if(sql.startsWith('SELECT event,event_epoch'))return {rows:[...events].map(([event,event_epoch])=>({event,event_epoch}))};
  else if(sql.startsWith('SELECT balance_cents'))return {rows:[{balance_cents:balance}]};
  else if(sql.startsWith('UPDATE wallet_accounts'))balance+=args[0];
  else if(sql.startsWith('INSERT INTO pstn_wallet_entries')){assert.ok(!ledger.has(args[0]));ledger.add(args[0]);}
  else if(sql.startsWith("UPDATE pstn_calls SET status='settled'")){call.status='settled';call.charged_cents=args[0];}
  return {rows:[]};
 }};return {pool:{connect:async()=>db},call,events,ledger,balance:()=>balance};
}
const epoch=Math.floor(Date.now()/1000)-300;
test('ICN answered settlement refunds unused reservation and duplicate events do not debit twice',async()=>{
 const f=fixture(),send=(event,time)=>settlePstn(f.pool,{callKey:f.call.call_key,event,epoch:time});
 assert.equal((await send('start',epoch))[0],200);assert.equal(f.balance(),98);
 assert.equal((await send('end',epoch+61))[0],200);assert.equal(f.call.charged_cents,1);assert.equal(f.balance(),99);
 await send('end',epoch+61);await send('start',epoch);assert.equal(f.balance(),99);assert.equal(f.ledger.size,1);
});
test('ICN failed attempt refunds full reservation once and out-of-order end waits for start',async()=>{
 const f=fixture();await settlePstn(f.pool,{callKey:f.call.call_key,event:'failed',epoch});assert.equal(f.call.charged_cents,0);assert.equal(f.balance(),100);
 await settlePstn(f.pool,{callKey:f.call.call_key,event:'failed',epoch});assert.equal(f.balance(),100);
 const g=fixture();await settlePstn(g.pool,{callKey:g.call.call_key,event:'end',epoch:epoch+61});assert.equal(g.balance(),98);
 await settlePstn(g.pool,{callKey:g.call.call_key,event:'start',epoch});assert.equal(g.balance(),99);
});
