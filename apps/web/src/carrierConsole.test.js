import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupCarrierConsole} from './carrierConsole.js';
test('carrier console renders backend records and preserves live form handlers when opening management',async()=>{
 const dom=new JSDOM('<section id="carrier-console"></section><section id="pbx-admin" class="workspace-inactive"><form id="pbx-trunk-form"></form><p id="pbx-status"></p></section><section id="carrier-admin" class="workspace-inactive"></section>');const document=dom.window.document;const form=document.getElementById('pbx-trunk-form');const handler=()=>{};form.onsubmit=handler;
 const proto=dom.window.HTMLDialogElement.prototype;proto.showModal=function(){this.open=true;};proto.close=function(){this.open=false;this.dispatchEvent(new dom.window.Event('close'));};
 const ui=setupCarrierConsole({document,role:()=> 'admin',get:async path=>path==='/api/pbx/trunks'?{trunks:[{name:'Flowroute primary',host:'us-east-va.sip.flowroute.com',port:5060,transport:'udp',enabled:0,priority:100,revision:2}]}:path==='/api/admin/carriers'?{providers:[{provider:'flowroute',status:'draft'}]}:{rates:[],blocks:[]}});await ui.refresh();
 assert.match(document.querySelector('.carrier-console-table').textContent,/Flowroute primary/);document.querySelector('[data-actions] button').click();assert.equal(form.closest('dialog').open,true);assert.equal(form.onsubmit,handler);document.querySelector('[data-close]').click();assert.equal(form.parentElement.id,'pbx-admin');
 document.querySelector('[data-tab=gateways]').click();assert.equal(document.querySelector('[data-actions]').textContent.includes('SIP credentials'),false);ui.stop();dom.window.close();
});
