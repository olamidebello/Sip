import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupCallsScreen} from './callsScreen.js';
test('contact picker has an explicit call action gated by destination and connection',()=>{
 const {window}=new JSDOM('<section id="calling-workspace"><h2>Calls</h2><ul id="recent-calls"></ul><details id="dialer-contacts"></details><form id="dial"><input name="target"></form><div id="softphone-tools"></div><p id="status">Connected</p></section>');const doc=window.document;window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};let connected=false;const dialed=[];const screen=setupCallsScreen({document:doc,get:async()=>({calls:[]}),request:async()=>{},show(){},dial:a=>dialed.push(a),connected:()=>connected});screen.open('contacts');const call=doc.querySelector('.calls-contact-call'),input=doc.querySelector('[name=target]');assert.equal(call.hidden,false);assert.equal(call.disabled,true);input.value='sip:alice@example.com';input.dispatchEvent(new window.Event('input'));assert.equal(call.disabled,true);connected=true;screen.connectionStatus('Connected');assert.equal(call.disabled,false);assert.equal(doc.querySelector('.calls-sip-retry').hidden,true);call.click();assert.deepEqual(dialed,['sip:alice@example.com']);assert.equal(doc.querySelector('dialog').open,false);screen.stop();
});

test('keypad remains usable through disconnect and reconnect and restores on close',async()=>{
 const {setupDialpad}=await import('./dialpad.js');
 const {window}=new JSDOM('<section id="calling-workspace"><h2>Calls</h2><ul id="recent-calls"></ul><details id="dialer-contacts"></details><form id="dial" hidden><label>Number<input name="target"></label><div id="dialpad"></div><button class="dialpad-call">Call</button></form><div id="softphone-tools"></div><p id="status">Connecting</p></section>');
 const doc=window.document;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const form=doc.getElementById('dial'),input=form.elements.target;
 setupDialpad({root:doc.getElementById('dialpad'),input,inCall:()=>false,sendTone(){},onError:assert.fail});
 let connected=false,retries=0,lastNumber=false;
 const screen=setupCallsScreen({document:doc,get:async()=>({calls:[]}),request:async()=>{},show(){},dial(){},connected:()=>connected,canRedial:()=>lastNumber,retryConnection:()=>{retries++;}});
 screen.open('keypad');assert.equal(form.hidden,false);
 assert.equal(doc.querySelectorAll('.calls-dialog [data-digit]').length,12);
 doc.querySelector('[data-digit="2"]').click();assert.equal(input.value,'2');
 assert.equal(form.querySelector('.dialpad-call').disabled,true);
 doc.querySelector('.calls-sip-retry').click();assert.equal(retries,1);
 form.hidden=true;screen.connectionStatus('Connection lost');assert.equal(form.hidden,false);
 assert.equal(doc.querySelector('[role=status]').textContent,'Connection lost');
 connected=true;screen.connectionStatus('Registered');assert.equal(form.querySelector('.dialpad-call').disabled,false);
 assert.equal(doc.querySelector('.calls-sip-retry').hidden,true);
 input.value='';input.dispatchEvent(new window.Event('input'));assert.equal(form.querySelector('.dialpad-call').disabled,true);lastNumber=true;input.dispatchEvent(new window.Event('input'));assert.equal(form.querySelector('.dialpad-call').disabled,false);assert.equal(form.querySelector('.dialpad-call').getAttribute('aria-label'),'Load last dialed number');input.value='2';input.dispatchEvent(new window.Event('input'));
 connected=false;form.hidden=true;screen.connectionStatus('Reconnecting');
 assert.equal(form.hidden,false);assert.equal(form.querySelector('.dialpad-call').disabled,true);
 screen.stop();assert.equal(form.closest('.calls-tools-source')!==null,true);
 screen.open('keypad');assert.equal(form.hidden,false);assert.equal(input.value,'2');screen.stop();
});
