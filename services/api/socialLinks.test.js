import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSocialLink,handleSocialLinks} from './socialLinks.js';
test('profile links reject lookalike domains, credentials and non-HTTPS URLs',()=>{assert.equal(validateSocialLink('x','https://x.com/alice?tracking=1'),'https://x.com/alice');for(const u of ['javascript:alert(1)','http://x.com/a','https://x.com.evil.test/a','https://user:pass@x.com/a','https://x.com/'])assert.throws(()=>validateSocialLink('x',u));assert.throws(()=>validateSocialLink('unknown','https://x.com/a'));});
test('link removal is restricted to current owner',async()=>{let params;const result=await handleSocialLinks({req:{method:'DELETE'},path:'/api/social/links/x',user:{id:'owner'},pool:{query:async(_,a)=>params=a},send:(_,code)=>code});assert.equal(result,200);assert.deepEqual(params,['owner','x']);});
