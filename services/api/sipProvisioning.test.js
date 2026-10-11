import test from 'node:test';
import assert from 'node:assert/strict';
import { createSipAccount, provisionSipAccount, encrypt } from './sipMarketplace.js';
import { reconcileSipAccounts, provisioningConfigured } from './sipProvisioning.js';

test('account creation uses its owner tenant and preserves an existing account',async()=>{
  let inserted;
  const db={query:async(sql,args)=>{
    if(sql.startsWith('SELECT id,username'))return {rows:[]};
    if(sql.startsWith('SELECT tenant_id'))return {rows:[{tenant_id:'tenant-b'}]};
    inserted=args;return {rows:[],rowCount:1};
  }};
  await createSipAccount(db,'user-b','sip.example.com');
  assert.equal(inserted[2],'tenant-b');
  const account={id:'existing',username:'stable',status:'active'};
  assert.deepEqual(await createSipAccount({query:async()=>({rows:[account]})},'user-b','new.example.com'),account);
});

test('unconfigured provisioning never acknowledges activation',async()=>{
  const saved=process.env.SIP_PROVISION_URL;
  delete process.env.SIP_PROVISION_URL;
  try {
    assert.equal(provisioningConfigured(),false);
    assert.equal(await provisionSipAccount({query:()=>{throw Error('must not activate');}},'user'),false);
  } finally {if(saved!==undefined)process.env.SIP_PROVISION_URL=saved;}
});

test('another replica holding the lock prevents reconciliation and releases connection',async()=>{
  let released=false,calls=0;
  await reconcileSipAccounts({connect:async()=>({query:async()=>{calls++;return {rows:[{acquired:0}]};},release:()=>{released=true;}})},'https://example.com');
  assert.equal(calls,1);assert.equal(released,true);
});

test('adapter acknowledgement is required and retries preserve account idempotency',async()=>{
  const saved={url:process.env.SIP_PROVISION_URL,token:process.env.SIP_PROVISION_TOKEN,key:process.env.SIP_CREDENTIAL_KEY,fetch:globalThis.fetch};
  process.env.SIP_PROVISION_URL='https://adapter.example/provision';process.env.SIP_PROVISION_TOKEN='test-token';process.env.SIP_CREDENTIAL_KEY='ab'.repeat(32);
  let acknowledgements=0,request;
  const db={query:async(sql)=>{
    if(sql.startsWith('SELECT'))return {rows:[{id:'account-id',tenant_id:'tenant',username:'sip-user',domain:'sip.example',secret_cipher:encrypt('secret',Buffer.from(process.env.SIP_CREDENTIAL_KEY,'hex'))}]};
    acknowledgements++;return {rows:[],rowCount:1};
  }};
  try {
    globalThis.fetch=async(url,options)=>{request=options;return {ok:true,json:async()=>({status:'pending'})};};
    assert.equal(await provisionSipAccount(db,'user'),false);assert.equal(acknowledgements,0);
    globalThis.fetch=async(url,options)=>{request=options;return {ok:true,json:async()=>({status:'active'})};};
    assert.equal(await provisionSipAccount(db,'user'),true);assert.equal(acknowledgements,1);
    assert.equal(request.headers['Idempotency-Key'],'account-id');assert.equal(JSON.parse(request.body).tenantId,'tenant');
  } finally {
    globalThis.fetch=saved.fetch;
    for(const [name,value] of [['SIP_PROVISION_URL',saved.url],['SIP_PROVISION_TOKEN',saved.token],['SIP_CREDENTIAL_KEY',saved.key]])if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
});

test('pending configuration records a durable delayed retry without activating',async()=>{
  const saved=process.env.SIP_PROVISION_URL;delete process.env.SIP_PROVISION_URL;
  let retry,released=false;
  const db={query:async(sql,args)=>{
    if(sql.includes('GET_LOCK'))return {rows:[{acquired:1}]};
    if(sql.includes('SELECT a.id,a.user_id'))return {rows:[{id:'a',user_id:'u',secret_cipher:Buffer.from('existing'),attempts:2}]};
    if(sql.startsWith('UPDATE sip_provisioning_jobs'))retry=args;
    return {rows:[],rowCount:1};
  },release:()=>{released=true;}};
  try {await reconcileSipAccounts({connect:async()=>db},'https://example.com');
    assert.deepEqual(retry,[120,'configuration_required','a']);assert.equal(released,true);
  } finally {if(saved!==undefined)process.env.SIP_PROVISION_URL=saved;}
});

test('same-server mode persists digest before activating and does not call an external adapter',async()=>{
  const saved={mode:process.env.SIP_PROVISION_MODE,key:process.env.SIP_CREDENTIAL_KEY,fetch:globalThis.fetch};
  process.env.SIP_PROVISION_MODE='kamailio_local';process.env.SIP_CREDENTIAL_KEY='ab'.repeat(32);
  const writes=[];
  const db={query:async(sql,args)=>{
    if(sql.startsWith('SELECT')){assert.ok(sql.includes("u.status='active'"));return {rows:[{id:'account-id',tenant_id:'tenant',username:'ol123',domain:'sip.example.com',secret_cipher:encrypt('x'.repeat(32),Buffer.from(process.env.SIP_CREDENTIAL_KEY,'hex'))}]};}
    writes.push({sql,args});return {rows:[],rowCount:1};
  }};
  try{
    globalThis.fetch=()=>{throw Error('External adapter must not be used');};
    assert.equal(provisioningConfigured(),true);
    assert.equal(await provisionSipAccount(db,'user'),true);
    assert.ok(writes[0].sql.startsWith('INSERT INTO olamide_sip_subscribers'));
    assert.ok(writes[1].sql.startsWith('UPDATE sip_accounts'));
    assert.equal(writes[0].args.includes('x'.repeat(32)),false);
  }finally{
    globalThis.fetch=saved.fetch;
    for(const [name,value] of [['SIP_PROVISION_MODE',saved.mode],['SIP_CREDENTIAL_KEY',saved.key]])if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
});
