import test from 'node:test';
import assert from 'node:assert/strict';
import {publishSocialText,verifySocialAccount} from './socialPublishing.js';
test('X text publishing uses user authorization and exact reviewed text',async()=>{const id=await publishSocialText('x','account','secret','Reviewed text',async(url,o)=>{assert.equal(url,'https://api.x.com/2/tweets');assert.equal(o.headers.Authorization,'Bearer secret');assert.deepEqual(JSON.parse(o.body),{text:'Reviewed text'});return {ok:true,json:async()=>({data:{id:'post'}})};});assert.equal(id,'post');});
test('Facebook connection rejects tokens that do not identify a Page',async()=>{await assert.rejects(verifySocialAccount('facebook','secret',async()=>({ok:true,json:async()=>({id:'123',name:'Personal account'})})),/Page token/);});
test('external posting requires confirmation and never contacts provider without it',async()=>{
 const {handleSocialPublishing}=await import('./socialPublishing.js');const old=process.env.PROVIDER_CREDENTIAL_KEY;process.env.PROVIDER_CREDENTIAL_KEY='a'.repeat(64);let queries=0,contacted=false;
 try{const r=await handleSocialPublishing({req:{method:'POST'},path:'/api/social/publishing/x/post',user:{id:'u',tenant_id:'t'},pool:{query:async()=>{queries++;return {rows:[]};}},send:(_,code)=>code,readJson:async()=>({text:'Hello',requestKey:'00000000-0000-4000-8000-000000000001'}),fetchImpl:async()=>{contacted=true;}});assert.equal(r,400);assert.equal(contacted,false);assert.equal(queries,2);}finally{if(old===undefined)delete process.env.PROVIDER_CREDENTIAL_KEY;else process.env.PROVIDER_CREDENTIAL_KEY=old;}
});
