import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {digestHa1,handleKamailioRoute,handleKamailioAuth} from './kamailio.js';

const token='t'.repeat(48);
function req(body,valid=true){
  const r=Readable.from([JSON.stringify(body)]);r.method='POST';
  r.headers={'content-type':'application/json',authorization:'Bearer '+(valid?token:'bad')};return r;
}
function response(){return {status:0,body:null,writeHead(status){this.status=status;},end(body){this.body=JSON.parse(body);}};}
test('digest HA1 uses username and realm without retaining plaintext',()=>{
  assert.equal(digestHa1('alice','example.com','secret'),'b1726872c344b6dc8365b774f8fd6412');
});
test('routing rejects missing secret before querying',async()=>{
  process.env.KAMAILIO_ROUTE_TOKEN=token;
  const res=response();await handleKamailioRoute({req:req({domain:'sip.example.com',caller:'alice',destination:'123'},false),res,
    pool:{query(){throw Error('unexpected query');}}});
  assert.equal(res.status,401);
});
test('routing rejects unknown tenant',async()=>{
  process.env.KAMAILIO_ROUTE_TOKEN=token;
  const res=response();await handleKamailioRoute({req:req({domain:'sip.example.com',caller:'alice',destination:'123'}),res,
    pool:{query:async()=>({rows:[],rowCount:0})}});
  assert.equal(res.status,404);
});
test('active tenant extension routes only to its own account',async()=>{
  process.env.KAMAILIO_ROUTE_TOKEN=token;
  const res=response(),calls=[];
  const pool={query:async(sql,args)=>{
    calls.push(args);
    if(sql.includes('FROM switch_tenants t'))return {rows:[{tenant_id:'tenant',tariff_id:null}],rowCount:1};
    if(sql.includes('FROM pbx_destinations d'))return {rows:[{username:'bob'}],rowCount:1};
    throw Error('unexpected query');
  }};
  await handleKamailioRoute({req:req({domain:'sip.example.com',caller:'alice',destination:'123'}),res,pool});
  assert.deepEqual(res.body,{route:'extension',username:'bob',domain:'sip.example.com'});
  assert.deepEqual(calls[1],['tenant','123','sip.example.com']);
});
test('authentication adapter returns HA1 only for an active subscriber',async()=>{
  process.env.KAMAILIO_ROUTE_TOKEN=token;
  const res=response(),pool={query:async(sql,args)=>{
    assert.match(sql,/kamailio_active_subscribers/);
    assert.deepEqual(args,['sip.example.com','alice']);
    return {rows:[{ha1:'b1726872c344b6dc8365b774f8fd6412'}],rowCount:1};
  }};
  await handleKamailioAuth({req:req({domain:'sip.example.com',username:'alice'}),res,pool});
  assert.equal(res.status,200);
  assert.deepEqual(res.body,{ha1:'b1726872c344b6dc8365b774f8fd6412'});
});
