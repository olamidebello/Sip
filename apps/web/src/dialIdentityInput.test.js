import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {setupDialIdentityInput,dialInputTarget} from './dialIdentityInput.js';
test('keypad displays number or full name while preserving the private SIP route',async()=>{
 const dom=new JSDOM('<input>');try{const input=dom.window.document.querySelector('input');const ui=setupDialIdentityInput({input,lookup:async()=> 'Alice Bello'});
 input.value='sip:123@example.com';await ui.refresh();assert.equal(input.value,'Alice Bello');assert.equal(dialInputTarget(input),'sip:123@example.com');assert.ok(!input.value.includes('@'));
 input.value='456';await ui.refresh();assert.equal(dialInputTarget(input),'456');assert.equal(input.dataset.routeTarget,undefined);
 }finally{dom.window.close();}
});
test('failed or stale identity lookups never expose the SIP profile or replace an edited number',async()=>{
 const dom=new JSDOM('<input>');try{const input=dom.window.document.querySelector('input');let finish;const ui=setupDialIdentityInput({input,lookup:()=>new Promise(resolve=>finish=resolve)});
 input.value='sip:alice@example.com';const pending=ui.refresh();assert.equal(input.value,'');assert.equal(input.placeholder,'Name unavailable');assert.equal(dialInputTarget(input),'sip:alice@example.com');
 input.value='789';await ui.refresh();finish('Alice Bello');await pending;assert.equal(input.value,'789');assert.equal(dialInputTarget(input),'789');
 }finally{dom.window.close();}
});
