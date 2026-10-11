import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {registerDigest} from './sipRegisterDigest.js';
const account={username:'oltest',domain:'sip.example',password:'test-secret'};
const md5=s=>createHash('md5').update(s).digest('hex');
test('REGISTER digest uses challenged realm and qop auth',()=>{
 const response={code:401,text:'SIP/2.0 401 Unauthorized\r\nWWW-Authenticate: Digest realm="different.realm", nonce="nonce", qop="auth,auth-int"\r\n'};
 const result=registerDigest(account,response,'client');
 const expected=md5(md5('oltest:different.realm:test-secret')+':nonce:00000001:client:auth:'+md5('REGISTER:sip:sip.example'));
 assert.ok(result.includes('response="'+expected+'"'));assert.match(result,/^Authorization:/);assert.match(result,/qop=auth/);assert.ok(!result.includes(account.password));
});
test('proxy challenges use Proxy-Authorization and unsupported algorithms fail',()=>{
 assert.match(registerDigest(account,{code:407,text:'Proxy-Authenticate: Digest realm="realm", nonce="n"'},'c'),/^Proxy-Authorization:/);
 assert.throws(()=>registerDigest(account,{code:401,text:'WWW-Authenticate: Digest realm="realm", nonce="n", algorithm=SHA-256'}),/Unsupported/);
});
