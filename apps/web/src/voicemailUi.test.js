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

test('navigation shortcuts open user and admin panels and survive menu rebuilds',async()=>{
 const dom=new JSDOM('<body><nav id="app-nav"><div class="menu-heading"></div></nav><section id="account"></section><section id="admin"></section></body>');let destinations=[];
 const ui=setupVoicemailUi({document:dom.window.document,isSignedIn:()=>true,isSuper:()=>true,show:x=>destinations.push(x),get:async p=>p==='/api/admin/voicemail'?{users:[]}:{enabled:true,maxSeconds:120,revision:1,provisioned:true},request:async()=>{},call:()=>{}});
 const doc=dom.window.document;doc.querySelector('[data-voicemail-nav="own"]').click();doc.querySelector('[data-voicemail-nav="manage"]').click();assert.deepEqual(destinations,['account','admin']);
 doc.querySelector('#app-nav').innerHTML='<div class="menu-heading"></div>';await new Promise(r=>setTimeout(r,20));assert.equal(doc.querySelectorAll('[data-voicemail-nav]').length,2);ui.dispose();dom.window.close();
});
test('main voicemail wiring reads the actual application role',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('./main.js',import.meta.url),'utf8');const line=source.split('\n').find(l=>l.startsWith('setupVoicemailUi('));assert.ok(line);let options;
 const setRole=new Function('setupVoicemailUi','document','showWorkspace','apiGet','accountRequest','dialForm',`let activeRole=null;${line};return role=>activeRole=role;`)(o=>options=o,{},()=>{},()=>{},()=>{},{});
 assert.equal(options.isSignedIn(),false);setRole('user');assert.equal(options.isSignedIn(),true);assert.equal(options.isSuper(),false);setRole('super_admin');assert.equal(options.isSuper(),true);setRole('pending_passkey');assert.equal(options.isSignedIn(),false);
});

test('regular user sees Voicemail inside Settings without a navigation header',async()=>{
 const dom=new JSDOM('<body><section id="messenger-settings"><div class="messenger-settings-menu"></div></section><section id="account"></section><section id="admin"></section></body>');let signed=true,destinations=[];
 const ui=setupVoicemailUi({document:dom.window.document,isSignedIn:()=>signed,isSuper:()=>false,show:x=>destinations.push(x),get:async()=>({enabled:true,maxSeconds:120,revision:1,provisioned:true}),request:async()=>{},call:()=>{}});
 const doc=dom.window.document,entry=doc.querySelector('.messenger-settings-menu [data-voicemail-settings]');assert.ok(entry);assert.equal(entry.hidden,false);assert.match(entry.textContent,/Voicemail/);entry.click();assert.deepEqual(destinations,['account']);assert.equal(doc.querySelector('#voicemail-settings').open,true);
 signed=false;doc.body.classList.add('logged-out');await new Promise(r=>setTimeout(r,20));assert.equal(entry.hidden,true);ui.dispose();assert.equal(doc.querySelector('[data-voicemail-settings]'),null);dom.window.close();
});
test('Voicemail row attaches when Settings is created after setup',async()=>{
 const dom=new JSDOM('<body><section id="account"></section></body>');const ui=setupVoicemailUi({document:dom.window.document,isSignedIn:()=>true,isSuper:()=>false,get:async()=>({}),request:async()=>{},call:()=>{}});
 dom.window.document.body.insertAdjacentHTML('beforeend','<div class="messenger-settings-menu"></div>');await new Promise(r=>setTimeout(r,20));assert.equal(dom.window.document.querySelectorAll('[data-voicemail-settings]').length,1);dom.window.document.body.classList.add('other');await new Promise(r=>setTimeout(r,20));assert.equal(dom.window.document.querySelectorAll('[data-voicemail-settings]').length,1);ui.dispose();dom.window.close();
});
