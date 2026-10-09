import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveMinute,handlePrepaid} from './prepaidAuthorizer.js';

const tenant='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
const rate='00000000-0000-4000-8000-000000000003';
test('prepaid endpoint is closed by default',async()=>{
  const old=process.env.LIVE_PREPAID_ENABLED;delete process.env.LIVE_PREPAID_ENABLED;
  try{let result;await handlePrepaid({req:{method:'POST',headers:{}},res:{},pool:{},send:(_r,status,data)=>{result={status,data};}});
    assert.equal(result.status,503);}
  finally{if(old===undefined)delete process.env.LIVE_PREPAID_ENABLED;else process.env.LIVE_PREPAID_ENABLED=old;}
});
test('insufficient prepaid funds refuses a new call without debit',async()=>{
  const queries=[];const db={query:async(sql)=>{queries.push(sql);
    if(sql.startsWith('SELECT available_cents'))return {rowCount:1,rows:[{available_cents:2,reserved_cents:0}]};
    return {rowCount:0,rows:[]};},release(){}};
  const result=await reserveMinute({connect:async()=>db},{tenant,user,source:'switch-1',legId:'leg-1',rateId:rate,priceCents:3});
  assert.equal(result.authorized,false);
  assert.equal(queries.includes('ROLLBACK'),true);
  assert.equal(queries.some(sql=>sql.startsWith('UPDATE prepaid_accounts')),false);
});
test('new call reserves at most ten minutes and returns a hard cutoff',async()=>{
  const queries=[];const db={query:async(sql,args)=>{queries.push([sql,args]);
    if(sql.startsWith('SELECT available_cents'))return {rowCount:1,rows:[{available_cents:1000,reserved_cents:0}]};
    return {rowCount:0,rows:[]};},release(){}};
  const result=await reserveMinute({connect:async()=>db},{tenant,user,source:'switch-1',legId:'leg-2',rateId:rate,priceCents:3});
  assert.equal(result.authorized,true);assert.equal(result.maxSeconds,600);
  const debit=queries.find(([sql])=>sql.startsWith('UPDATE prepaid_accounts'));
  assert.equal(debit[1][0],30);
  assert.equal(queries.at(-1)[0],'COMMIT');
});
