import test from 'node:test';import assert from 'node:assert/strict';import {appFixture} from '../navigationTestSupport.js';import {readFile} from 'node:fs/promises';
test('visible platform copy and README use Olamide branding',async()=>{
 const app=await appFixture();try{await app.signIn('super_admin');assert.doesNotMatch(app.document.body.textContent,/\bASTPP\b/i);const readme=await readFile(new URL('../../../README.md',import.meta.url),'utf8');assert.doesNotMatch(readme,/\bASTPP\b/i);}finally{app.close();}
});
