import test from 'node:test';
import assert from 'node:assert/strict';
import {handleProviderCredentials,providerCredentials} from './providerCredentials.js';

test('credential metadata is tenant scoped and excludes secrets',async()=>{
  const calls=[];
  const pool={query:async(sql,args)=>{calls.push(args);return {rows:[{provider:'didww',enabled:1,revision:2}],rowCount:1};}};
  const response=await handleProviderCredentials({req:{method:'GET'},res:{},
    path:'/api/admin/carriers/credentials',user:{role:'super_admin',tenant_id:'tenant-a'},
    pool,send:(_res,status,body)=>({status,body})});
  assert.equal(response.status,200);
  assert.deepEqual(calls,[['tenant-a']]);
  assert.equal(response.body.entries[0].revision,2);
  assert.equal(JSON.stringify(response.body).includes('apiKey'),false);
});
test('credential writes reject absent server key and non-admin users',async()=>{
  const original=process.env.PROVIDER_CREDENTIAL_KEY;
  delete process.env.PROVIDER_CREDENTIAL_KEY;
  try{
    const base={req:{method:'PUT'},res:{},path:'/api/admin/carriers/credentials/didww',
      pool:{query:async()=>{throw Error('No query expected');}},
      send:(_res,status,body)=>({status,body}),readJson:async()=>({})};
    assert.equal((await handleProviderCredentials({...base,user:{role:'admin'}})).status,403);
    assert.equal((await handleProviderCredentials({...base,user:{role:'super_admin'}})).status,409);
    assert.equal(await providerCredentials(null,'tenant-a','didww'),null);
  }finally{
    if(original===undefined)delete process.env.PROVIDER_CREDENTIAL_KEY;
    else process.env.PROVIDER_CREDENTIAL_KEY=original;
  }
});
test('Flowroute SIP profile stays encrypted and is writable only by super admin',async()=>{
  const previous=process.env.PROVIDER_CREDENTIAL_KEY;
  process.env.PROVIDER_CREDENTIAL_KEY='a'.repeat(64);
  let ciphertext;
  const db={query:async(sql,args)=>{
    if(sql.startsWith('SELECT revision'))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO provider_api_credentials'))ciphertext=args[2];
    return {rows:[],rowCount:1};
  },release(){}};
  const pool={connect:async()=>db,query:async()=>({rows:[{ciphertext,enabled:1}],rowCount:1})};
  try{
    const base={req:{method:'PUT'},res:{},path:'/api/admin/carriers/credentials/flowroute',pool,
      readJson:async()=>({accessKey:'access',secretKey:'secret',sipUsername:'sip-user',sipPassword:'sip-pass',expectedRevision:0}),
      send:(_res,status,body)=>({status,body})};
    assert.equal((await handleProviderCredentials({...base,user:{role:'admin'}})).status,403);
    assert.equal((await handleProviderCredentials({...base,user:{role:'super_admin',tenant_id:'tenant-a',id:'admin-a'}})).status,200);
    assert.equal(ciphertext.includes(Buffer.from('sip-pass')),false);
    assert.equal((await providerCredentials(pool,'tenant-a','flowroute')).sipUsername,'sip-user');
  }finally{
    if(previous===undefined)delete process.env.PROVIDER_CREDENTIAL_KEY;
    else process.env.PROVIDER_CREDENTIAL_KEY=previous;
  }
});
