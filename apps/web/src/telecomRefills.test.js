import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {setupTelecomRefills} from './telecomRefills.js';
test('refill retries retain request ID and sign-out clears wallet data',async()=>{
 const dom=new JSDOM('<section id="telecom-feature-core-refills"></section>'),document=dom.window.document,calls=[];let fail=true;
 const workspace=setupTelecomRefills({document,get:async()=>({rows:[],note:'Manual funding'}),uuid:()=> 'stable-id',request:async(path,body)=>{calls.push(body);if(fail)throw Error('timeout');}});const form=document.querySelector('form');form.elements.userId.value='user';form.elements.amountCents.value='100';form.elements.reference.value='funding';await form.onsubmit({preventDefault(){}});fail=false;await form.onsubmit({preventDefault(){}});assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(calls[1].amountCents,100);workspace.stop();assert.equal(form.elements.userId.value,'');dom.window.close();
});
