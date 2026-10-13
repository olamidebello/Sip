import test from 'node:test';
import assert from 'node:assert/strict';
import {validSocialBody,handleSocial} from './social.js';
test('post validation counts Unicode characters and rejects empty and oversized bodies',()=>{assert.equal(validSocialBody('😀'.repeat(280)),true);for(const b of ['',null,'  ','x'.repeat(281)])assert.equal(validSocialBody(b),false);});
test('hidden Social permission prevents all post access before content queries',async()=>{let n=0;const result=await handleSocial({req:{method:'GET'},path:'/api/social/posts',user:{id:'u',tenant_id:'t'},pool:{query:async()=>{n++;return {rows:n===1?[]:[{policy:{social:false}}]};}},send:(_,code)=>code});assert.equal(result,403);assert.equal(n,2);});
