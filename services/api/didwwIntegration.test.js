import test from 'node:test';
import assert from 'node:assert/strict';
import {didwwSignature,validDidwwSignature,handleDidwwAdmin,handleDidwwCallback} from './didwwIntegration.js';
import {gzipSync} from 'node:zlib';

test('DIDWW published order callback signature example',()=>{
  const url='https://mycompany.com/didww_callbacks?opaque=123';
  const payload={type:'orders',status:'completed',id:'bf2cee72-6caa-4ae2-917e-bea01945691e'};
  const secret='szrdgh6547umt7tht7xbqhj6g9gdbyp7';
  assert.equal(didwwSignature(url,payload,secret),'30f66e9d72eb5e193051fd02952f70d8e934b4ff');
  assert.equal(validDidwwSignature(url,payload,secret,'30f66e9d72eb5e193051fd02952f70d8e934b4ff'),true);
  assert.equal(validDidwwSignature(url,payload,secret,'00f66e9d72eb5e193051fd02952f70d8e934b4ff'),false);
});

test('DIDWW admin access remains tenant bound',async()=>{
  const result=await handleDidwwAdmin({req:{method:'GET'},path:'/api/admin/didww/config',
    user:{role:'super_admin',tenant_id:'00000000-0000-4000-8000-000000000001'},
    pool:{query:()=>{throw Error('unexpected query');}},origin:'https://sip.example.com',
    send:(_res,status,body)=>({status,body})});
  assert.equal(result.status,409);
});

test('signed DIDWW form callback is persisted once and unsigned callback is rejected',async()=>{
  const tenant='00000000-0000-4000-8000-000000000001';
  const origin='https://sip.example.com';
  const path=`/api/webhooks/didww/${tenant}`;
  const secret='test-callback-secret';
  const previous={tenant:process.env.DIDWW_TENANT_ID,secret:process.env.DIDWW_CALLBACK_SECRET};
  process.env.DIDWW_TENANT_ID=tenant;process.env.DIDWW_CALLBACK_SECRET=secret;
  const payload={id:'bf2cee72-6caa-4ae2-917e-bea01945691e',status:'completed',type:'orders'};
  const body=new URLSearchParams(payload).toString();
  const signature=didwwSignature(origin+path,payload,secret);
  const calls=[];
  const request=signatureValue=>({method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded','x-didww-signature':signatureValue},
    async *[Symbol.asyncIterator](){yield Buffer.from(body);}});
  const opts={path,pool:{query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[]};}},
    origin,send:(_res,status,data)=>({status,data})};
  try{
    const rejected=await handleDidwwCallback({...opts,req:request('0'.repeat(40))});
    assert.equal(rejected.status,401);
    assert.equal(calls.length,0);
    const accepted=await handleDidwwCallback({...opts,req:request(signature)});
    assert.equal(accepted.status,202);
    assert.match(calls[0].sql,/INSERT IGNORE INTO didww_callback_events/);
  }finally{
    if(previous.tenant===undefined)delete process.env.DIDWW_TENANT_ID;else process.env.DIDWW_TENANT_ID=previous.tenant;
    if(previous.secret===undefined)delete process.env.DIDWW_CALLBACK_SECRET;else process.env.DIDWW_CALLBACK_SECRET=previous.secret;
  }
});

test('authenticated gzip CDR batch is recorded without storing call payload',async()=>{
  const tenant='00000000-0000-4000-8000-000000000001';
  const old={tenant:process.env.DIDWW_TENANT_ID,token:process.env.DIDWW_CALL_EVENTS_TOKEN};
  process.env.DIDWW_TENANT_ID=tenant;process.env.DIDWW_CALL_EVENTS_TOKEN='test-token';
  const calls=[];
  const payload=gzipSync(Buffer.from(JSON.stringify([
    {type:'inbound-cdr',id:'cdr-1',attributes:{did_number:'123456789'}},
    {type:'outbound-cdr',id:'cdr-2',attributes:{dst_number:'987654321'}}
  ])));
  const req={method:'POST',headers:{'x-auth-token':'test-token','content-type':'text/plain','content-encoding':'gzip'},
    async *[Symbol.asyncIterator](){yield payload;}};
  try{
    const result=await handleDidwwCallback({req,path:`/api/webhooks/didww/${tenant}/call-events`,
      origin:'https://sip.example.com',pool:{query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1};}},
      send:(_res,status,body)=>({status,body})});
    assert.equal(result.status,202);assert.equal(result.body.count,2);
    assert.equal(calls.length,2);assert.equal(calls[0].params[3],'inbound-cdr');
    assert.equal(calls[0].params.length,5);
  }finally{
    if(old.tenant===undefined)delete process.env.DIDWW_TENANT_ID;else process.env.DIDWW_TENANT_ID=old.tenant;
    if(old.token===undefined)delete process.env.DIDWW_CALL_EVENTS_TOKEN;else process.env.DIDWW_CALL_EVENTS_TOKEN=old.token;
  }
});
