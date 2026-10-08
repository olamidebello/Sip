import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {randomBytes,createCipheriv} from 'node:crypto';
import {handleSwitchXml,handleSwitchAdmin} from './switch.js';

const secret='a'.repeat(48),key=Buffer.alloc(32,9);
function encrypt(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  return Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]);}
function response(){return {status:0,headers:{},body:'',writeHead(status,headers={}){this.status=status;this.headers=headers;},end(body=''){this.body=body;}};}
function request(params,auth=true){const req=Readable.from([new URLSearchParams(params).toString()]);
  req.method='POST';req.headers={'content-type':'application/x-www-form-urlencoded',
    ...(auth?{authorization:'Basic '+Buffer.from('olamide:'+secret).toString('base64')}:{})};return req;}
test('XML gateway refuses missing authentication',async()=>{
  process.env.FREESWITCH_XML_PASSWORD=secret;
  const res=response();await handleSwitchXml({req:request({section:'directory'},false),res,pool:{query(){throw Error('queried')}}});
  assert.equal(res.status,401);
});
test('directory serves active account with tenant context and escaped credential',async()=>{
  process.env.FREESWITCH_XML_PASSWORD=secret;process.env.SIP_CREDENTIAL_KEY=key.toString('hex');
  const tenant='11111111-1111-4111-8111-111111111111',res=response();
  const pool={query:async()=>({rows:[{username:'ol123',domain:'sip.example.com',tenant_id:tenant,secret_cipher:encrypt('abc&<"')}]})};
  await handleSwitchXml({req:request({section:'directory',domain:'sip.example.com',user:'ol123'}),res,pool});
  assert.equal(res.status,200);assert.match(res.body,/abc&amp;&lt;&quot;/);
  assert.match(res.body,/ol_11111111111141118111111111111111/);
});
test('unknown dialplan caller fails closed',async()=>{
  process.env.FREESWITCH_XML_PASSWORD=secret;
  const res=response(),pool={query:async()=>({rows:[],rowCount:0})};
  await handleSwitchXml({req:request({section:'dialplan',context:'ol_11111111111141118111111111111111',
    sip_auth_username:'ol123',destination_number:'+12125550123'}),res,pool});
  assert.match(res.body,/not found/);
});
test('authenticated call selects tenant tariff and mapped gateway',async()=>{
  process.env.FREESWITCH_XML_PASSWORD=secret;
  const calls=[];
  const pool={query:async(sql)=>{
    calls.push(sql);
    if(sql.includes('FROM switch_tenants t'))return {rows:[{domain:'sip.example.com',tariff_id:'tariff'}],rowCount:1};
    if(sql.includes('FROM pbx_outbound_policies'))return {rows:[]};
    if(sql.includes('FROM operator_tariff_rates'))return {rows:[{provider:'flowroute',prefix:'1',cost_cents:2,
      price_cents:3,priority:100,effective_at:new Date('2020-01-01T00:00:00Z'),expires_at:null,enabled:true,mode:'least_cost'}]};
    if(sql.includes('FROM operator_fraud_rules'))return {rows:[]};
    if(sql.includes('FROM carrier_provider_profiles'))return {rows:[{provider:'flowroute',status:'active',routing_mode:'least_cost',gateway_name:'flowroute_primary'}]};
    throw Error('unexpected SQL');
  }};
  const res=response();await handleSwitchXml({req:request({section:'dialplan',
    context:'ol_11111111111141118111111111111111',sip_auth_username:'ol123',
    destination_number:'+12125550123'}),res,pool});
  assert.match(res.body,/sofia\/gateway\/flowroute_primary\/12125550123/);
  assert.match(res.body,/expression="\^\\\+12125550123\$"/);
});
test('admin cannot enable switch without super admin role',async()=>{
  let status=0;await handleSwitchAdmin({req:{method:'PUT'},path:'/api/admin/switch',
    user:{role:'admin',tenant_id:'x'},send:(_res,code)=>{status=code;}});assert.equal(status,403);
});
