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
