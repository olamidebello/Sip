import test from 'node:test';
import assert from 'node:assert/strict';
import {invokeAdapter} from './adapterRegistry.js';
import {handleAdapterTargets,savedTargets} from './adapterTargets.js';
test('target credentials remain encrypted and GUI metadata never exposes the token',async()=>{
 const prior=process.env.PROVIDER_CREDENTIAL_KEY;process.env.PROVIDER_CREDENTIAL_KEY='a'.repeat(64);let ciphertext;
 const db={query:async(sql,args)=>{if(sql.startsWith('INSERT INTO carrier_adapter_targets'))ciphertext=args[2];return {rows:[],rowCount:0};},release(){}};
 const pool={connect:async()=>db,query:async()=>({rows:ciphertext?[{target_key:'us-east',ciphertext,revision:1}]:[],rowCount:ciphertext?1:0})};
 const base={res:{},user:{role:'super_admin',id:'admin',tenant_id:'tenant-a'},pool,send:(_r,code,body)=>({code,body}),environmentTargets:{}};
 try{
 const token='private-example-token-'.repeat(3);const saved=await handleAdapterTargets({...base,req:{method:'PUT'},path:'/api/admin/carrier-adapters/targets/us-east',readJson:async()=>({url:'https://adapter.example/provision',token,expectedRevision:0})});assert.equal(saved.code,200);assert.equal(ciphertext.includes(Buffer.from(token)),false);
 const list=await handleAdapterTargets({...base,req:{method:'GET'},path:'/api/admin/carrier-adapters/targets'});assert.equal(list.body.targets[0].key,'us-east');assert.equal(JSON.stringify(list.body).includes(token),false);assert.equal((await savedTargets(pool,'tenant-a'))['us-east'].token,token);
 const originalFetch=globalThis.fetch;try{globalThis.fetch=async(url,request)=>{assert.equal(url,'https://adapter.example/provision');assert.equal(request.headers.Authorization,'Bearer '+token);return new Response(JSON.stringify({status:'healthy'}));};assert.equal((await invokeAdapter({target_key:'us-east'},'health',{tenantId:'tenant-a'},pool)).status,'healthy');}finally{globalThis.fetch=originalFetch;}
 await assert.rejects(()=>savedTargets(pool,'different-tenant'));
 }finally{if(prior===undefined)delete process.env.PROVIDER_CREDENTIAL_KEY;else process.env.PROVIDER_CREDENTIAL_KEY=prior;}
});
test('ordinary admins cannot change targets and non-HTTPS endpoints are rejected',async()=>{
 const prior=process.env.PROVIDER_CREDENTIAL_KEY;process.env.PROVIDER_CREDENTIAL_KEY='a'.repeat(64);
 try{const base={req:{method:'PUT'},res:{},path:'/api/admin/carrier-adapters/targets/us-east',pool:{connect:()=>{throw Error('must not connect');}},send:(_r,code,body)=>({code,body}),readJson:async()=>({url:'http://untrusted.example',token:'x'.repeat(32),expectedRevision:0}),environmentTargets:{}};
 assert.equal((await handleAdapterTargets({...base,user:{role:'admin'}})).code,403);assert.equal((await handleAdapterTargets({...base,user:{role:'super_admin'}})).code,400);
 }finally{if(prior===undefined)delete process.env.PROVIDER_CREDENTIAL_KEY;else process.env.PROVIDER_CREDENTIAL_KEY=prior;}
});
