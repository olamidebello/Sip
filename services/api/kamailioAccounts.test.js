import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sipDigest,provisionKamailioAccount} from './kamailioAccounts.js';
test('digest binds password, username and realm',()=>{
  const password='a'.repeat(32),result=sipDigest('ol123','sip.example.com',password);
  assert.equal(result.ha1,createHash('md5').update(`ol123:sip.example.com:${password}`).digest('hex'));
  assert.notEqual(result.ha1,sipDigest('ol123','other.example.com',password).ha1);
  assert.notEqual(result.ha1,sipDigest('ol123','sip.example.com','b'.repeat(32)).ha1);
  assert.throws(()=>sipDigest('ol123','sip.example.com','short'));
});
test('local provisioning stores digest only and preserves account identity',async()=>{
  let params;const password='x'.repeat(32);
  await provisionKamailioAccount({query:async(sql,p)=>{params=p;assert.ok(sql.includes('ON DUPLICATE KEY UPDATE'));}}, {id:'account',username:'ol123',domain:'sip.example.com'},password);
  assert.equal(params[0],'account');assert.equal(params.includes(password),false);
});
