import test from 'node:test';
import assert from 'node:assert/strict';
import {createSipAccount} from './sipMarketplace.js';

const tenant='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';

test('new active tenant user gets encrypted SIP secret and digest credential atomically',async()=>{
  const prior=process.env.SIP_CREDENTIAL_KEY;
  process.env.SIP_CREDENTIAL_KEY='ab'.repeat(32);
  const calls=[];
  const db={query:async(sql,values)=>{
    calls.push({sql,values});
    if(sql.startsWith('SELECT domain,enabled'))return {rows:[{domain:'sip.example.com',enabled:1}]};
    return {rows:[],rowCount:1};
  }};
  try{
    const account=await createSipAccount(db,user,'wrong.example.com',tenant);
    assert.equal(account.status,'active');
    const insert=calls.find(row=>row.sql.startsWith('INSERT INTO sip_accounts'));
    assert.deepEqual(insert.values.slice(1,5),[user,tenant,account.username,'sip.example.com']);
    assert.equal(insert.values[5],'active');
    assert.ok(Buffer.isBuffer(insert.values[6]));
    assert.match(calls.at(-1).sql,/INSERT INTO kamailio_credentials/);
    assert.match(calls.at(-1).values[3],/^[a-f0-9]{32}$/);
  }finally{if(prior===undefined)delete process.env.SIP_CREDENTIAL_KEY;else process.env.SIP_CREDENTIAL_KEY=prior;}
});

test('without a SIP encryption key the record stays pending and has no digest credential',async()=>{
  const prior=process.env.SIP_CREDENTIAL_KEY;
  delete process.env.SIP_CREDENTIAL_KEY;
  const calls=[];
  const db={query:async(sql,values)=>{
    calls.push({sql,values});
    if(sql.startsWith('SELECT domain,enabled'))return {rows:[{domain:'sip.example.com',enabled:1}]};
    return {rows:[],rowCount:1};
  }};
  try{
    assert.equal((await createSipAccount(db,user,'sip.example.com',tenant)).status,'awaiting_switch');
    assert.equal(calls.at(-1).values[5],'awaiting_switch');
    assert.equal(calls.at(-1).values[6],null);
    assert.ok(!calls.some(row=>row.sql.includes('kamailio_credentials')));
  }finally{if(prior===undefined)delete process.env.SIP_CREDENTIAL_KEY;else process.env.SIP_CREDENTIAL_KEY=prior;}
});
