import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupQuickSignup} from './quickSignup.js';
function page(){return new JSDOM('<section id="account"><form id="login"><input name="email"></form><form id="signup"></form></section>',{url:'https://sip.dobhrap.com/pages/signup'});}
test('quick signup sends credentials once, displays SMS instruction, polls with secret only and clears credentials',async()=>{
 const dom=page(),document=dom.window.document,calls=[];
 setupQuickSignup({document,get:async()=>({captchaId:'id',image:'data:image/png;base64,a'}),getUserId:()=>null,request:async(path,body)=>{calls.push([path,body]);return path.endsWith('/start')?{token:'a'.repeat(64),number:'+12109050290',message:'OLAMIDE ABCDEF0123456789',expiresInSeconds:600}:{state:'verified'};}});
 const box=document.querySelector('details'),f=box.querySelector('form');
 f.elements.email.value='new@example.com';f.elements.password.value=f.elements.confirmPassword.value='long-password-123';f.elements.captchaId.value='captcha';f.elements.captchaAnswer.value='234567';
 await f.onsubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(calls[0][1].password,'long-password-123');assert.equal(f.elements.password.value,'');
 assert.equal(box.querySelector('[data-number]').textContent,'+12109050290');assert.match(box.querySelector('[data-sms]').href,/sms:\+12109050290\?body=OLAMIDE%20ABCDEF0123456789/);
 assert.equal(dom.window.sessionStorage.getItem('olamide-quick-signup').includes('long-password'),false);
 await box.querySelector('[data-check]').onclick();
 assert.deepEqual(calls[1][1],{token:'a'.repeat(64)});assert.equal(document.getElementById('login').elements.email.value,'new@example.com');
 assert.match(box.querySelector('[role=status]').textContent,/Phone verified/);assert.equal(dom.window.sessionStorage.getItem('olamide-quick-signup'),null);dom.window.close();
});
test('mismatched passwords never issue signup or start polling',async()=>{
 const dom=page(),document=dom.window.document;
 setupQuickSignup({document,get:async()=>({}),request:()=>{throw Error('Must not call');},getUserId:()=>null});
 const f=document.querySelector('details form');f.elements.password.value='one';f.elements.confirmPassword.value='two';await f.onsubmit({preventDefault(){}});
 assert.match(document.querySelector('details [role=status]').textContent,/Passwords must match/);dom.window.close();
});
test('profile prompt rejects stale account refresh and sends only profile fields',async()=>{
 const dom=page(),document=dom.window.document;let owner='one',resolve;const requests=[];
 const ui=setupQuickSignup({document,getUserId:()=>owner,get:()=>new Promise(r=>{resolve=r;}),request:async(...args)=>{requests.push(args);}});
 const old=ui.refreshProfile();owner='two';resolve({required:true});await old;
 const profile=document.querySelector('#account > section');assert.equal(profile.hidden,true);
 const current=ui.refreshProfile();resolve({required:true});await current;assert.equal(profile.hidden,false);
 const f=profile.querySelector('form');for(const [k,v]of Object.entries({name:'New Person',address1:'1 Main St',address2:'',city:'Dallas',region:'TX',postalCode:'75001',country:'US'}))f.elements[k].value=v;
 await f.onsubmit({preventDefault(){},currentTarget:f});assert.equal(requests[0][0],'/api/account/quick-profile');assert.equal(requests[0][2],'PUT');assert.equal(requests[0][1].phone,undefined);assert.equal(profile.hidden,true);dom.window.close();
});
test('waiting screen displays signup conflict and stops polling',async()=>{
 const dom=page(),document=dom.window.document;
 setupQuickSignup({document,get:async()=>({}),getUserId:()=>null,request:async path=>path.endsWith('/start')?{token:'a'.repeat(64),number:'+12109050290',message:'OLAMIDE ABCDEF0123456789',expiresInSeconds:600}:{state:'unavailable',error:'This phone or login may already have an account. Use password recovery.'}});
 const box=document.querySelector('details'),f=box.querySelector('form');
 f.elements.email.value='new@example.com';f.elements.password.value=f.elements.confirmPassword.value='long-password-123';
 await f.onsubmit({preventDefault(){}});await box.querySelector('[data-check]').onclick();
 assert.match(box.querySelector('[role=status]').textContent,/Use password recovery/);
 assert.equal(box.querySelector('[data-instructions]').hidden,true);
 assert.equal(dom.window.sessionStorage.getItem('olamide-quick-signup'),null);dom.window.close();
});
