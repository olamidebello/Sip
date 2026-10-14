import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupFlowrouteTrunkAdmin} from './flowrouteTrunkAdmin.js';
test('super admin SIP form uses separate endpoint and clears password after saving',async()=>{
 const dom=new JSDOM('<section id="root"></section>');const old={document:globalThis.document,FormData:globalThis.FormData};globalThis.document=dom.window.document;globalThis.FormData=dom.window.FormData;
 try{
 const calls=[],root=document.querySelector('#root');const config={configured:true,revision:2,authenticationMode:'ip',pop:'US-East-VA',sipUsername:'12345678',techPrefix:'12345678',publicIp:'154.29.77.102',callerId:'+12125550123',maxConcurrentCalls:500,allowedIpConfirmed:true,passwordConfigured:true};
 const ui=setupFlowrouteTrunkAdmin({root,get:async()=>config,request:async(...args)=>{calls.push(args);return {};},onSaved:async()=>{}});await ui.refresh();
 const form=root.querySelector('form');form.elements.sipPassword.value='new-example-secret';await form.onsubmit({preventDefault(){}});
 assert.equal(calls[0][0],'/api/admin/carriers/flowroute/trunk');assert.equal(calls[0][1].expectedRevision,2);assert.equal(calls[0][1].sipPassword,'new-example-secret');assert.equal(calls[0][1].allowedIpConfirmed,true);assert.equal(form.elements.sipPassword.value,'');
 await root.querySelector('[data-provision]').onclick();assert.equal(calls[1][0],'/api/admin/carriers/flowroute/trunk/provision');
 }finally{globalThis.document=old.document;globalThis.FormData=old.FormData;dom.window.close();}
});
