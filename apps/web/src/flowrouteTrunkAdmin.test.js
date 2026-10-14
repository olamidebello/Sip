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

test('gateway lifecycle controls use backend state and correct management endpoints',async()=>{
 const dom=new JSDOM('<section id="root"></section>');const old={document:globalThis.document,FormData:globalThis.FormData};globalThis.document=dom.window.document;globalThis.FormData=dom.window.FormData;dom.window.confirm=()=>true;
 try{
 const root=document.querySelector('#root'),calls=[];let active=true,configured=true;
 const ui=setupFlowrouteTrunkAdmin({root,get:async path=>path.endsWith('/status')?{profile:{status:active?'active':'draft'},adapterConfigured:true,operations:[]}:{configured,revision:configured?2:0,authenticationMode:'ip',pop:'US-East-VA',sipUsername:'12345678',techPrefix:'12345678',publicIp:'154.29.77.102',callerId:'+12125550123',maxConcurrentCalls:500,allowedIpConfirmed:true,passwordConfigured:true},request:async(path,b,method)=>{calls.push({path,b,method});if(path.endsWith('/deactivate'))active=false;if(method==='DELETE')configured=false;return {};},onSaved:async()=>{}});
 await ui.refresh();assert.equal(root.querySelector('[data-remove]').disabled,true);assert.equal(root.querySelector('[data-provision]').disabled,true);assert.equal(root.querySelector('form button').disabled,true);
 await root.querySelector('[data-deactivate]').onclick();assert.equal(calls[0].path,'/api/admin/carriers/flowroute/deactivate');assert.equal(root.querySelector('[data-remove]').disabled,false);
 await root.querySelector('[data-remove]').onclick();assert.equal(calls[1].method,'DELETE');assert.equal(calls[1].b.expectedRevision,2);assert.equal(root.querySelector('[data-remove]').disabled,true);
 }finally{globalThis.document=old.document;globalThis.FormData=old.FormData;dom.window.close();}
});
