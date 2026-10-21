import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {setupVoicemailUi} from './voicemailUi.js';
test('voicemail GUI loads, saves revision, calls *98 and settles signed out',async()=>{
 const dom=new JSDOM('<body><section id="account"></section><section id="admin"></section></body>');let signed=true,calls=[],saved;
 const ui=setupVoicemailUi({document:dom.window.document,isSignedIn:()=>signed,isSuper:()=>false,get:async()=>({enabled:true,maxSeconds:120,revision:2,provisioned:true}),request:async(...a)=>{saved=a;},call:n=>calls.push(n)});
 const own=dom.window.document.querySelector('#voicemail-settings');own.open=true;await new Promise(r=>setTimeout(r,20));assert.equal(own.hidden,false);assert.equal(own.querySelector('[data-enabled]').checked,true);
 own.querySelector('[data-seconds]').value=60;own.querySelector('[data-save]').click();await new Promise(r=>setTimeout(r,10));assert.deepEqual(saved,['/api/voicemail',{enabled:true,maxSeconds:60,revision:2},'PUT']);
 [...own.querySelectorAll('button')].find(b=>b.textContent.includes('*98')).click();assert.deepEqual(calls,['*98']);signed=false;dom.window.document.body.classList.add('logout');await new Promise(r=>setTimeout(r,20));assert.equal(own.hidden,true);ui.dispose();dom.window.close();
});
test('super admin has visible shortcut, per-user controls and provisioning',async()=>{
 const dom=new JSDOM('<body><section id="account"></section><section id="admin"></section></body>');let requests=[];
 const ui=setupVoicemailUi({document:dom.window.document,isSignedIn:()=>true,isSuper:()=>true,get:async path=>path==='/api/admin/voicemail'?{users:[{id:'one',email:'one@example.com'}]}:{enabled:true,maxSeconds:120,revision:3,provisioned:true},request:async(...args)=>requests.push(args),call:()=>{}});
 const admin=dom.window.document.querySelector('#admin');assert.equal(admin.firstChild.hidden,false);admin.firstChild.click();await new Promise(r=>setTimeout(r,20));
 const panel=admin.querySelector('details');assert.equal(panel.open,true);assert.equal(panel.querySelector('select').value,'one');assert.equal(panel.querySelector('[data-save]').disabled,false);
 [...panel.querySelectorAll('button')].find(b=>b.textContent==='Provision missing mailboxes').click();await new Promise(r=>setTimeout(r,10));assert.deepEqual(requests[0],['/api/admin/voicemail/provision',{}]);ui.dispose();dom.window.close();
});
