import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';
test('signup phone validates international numbers and rejects local format',async()=>{
 const app=await appFixture();try{
 const phone=app.document.querySelector('#signup [name=phone]');
 phone.value='+2348012345678';assert.equal(phone.checkValidity(),true);
 phone.value='08012345678';assert.equal(phone.checkValidity(),false);
 await new Promise(r=>setImmediate(r));
 assert.match(app.document.querySelector('#signup-status').textContent,/Phone/);
 }finally{app.close();}
});
test('registration and CAPTCHA errors appear beside the signup submit button',async()=>{
 const app=await appFixture();try{
 app.document.querySelector('#account-status').textContent='Account already exists';
 await new Promise(r=>setImmediate(r));
 assert.equal(app.document.querySelector('#signup-status').textContent,'Account already exists');
 assert.equal(app.document.querySelector('#signup-status').closest('form').id,'signup');
 }finally{app.close();}
});
