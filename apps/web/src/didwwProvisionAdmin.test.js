import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupDidwwProvisionAdmin} from './didwwProvisionAdmin.js';
test('DIDWW GUI lists users and submits tenant-bound assignments without displaying stored secrets',async()=>{
 const dom=new JSDOM('<section id="root"></section>');const oldDocument=globalThis.document,oldForm=globalThis.FormData;
 globalThis.document=dom.window.document;globalThis.FormData=dom.window.FormData;
 const user='22222222-2222-2222-2222-222222222222';const requests=[];
 const get=async()=>({config:null,revision:0,apiKeyConfigured:true,users:[{id:user,email:'person@example.com'}],jobs:[],worker:{available:true}});
 try{
  const root=document.getElementById('root'),ui=setupDidwwProvisionAdmin({root,get,request:async(...args)=>requests.push(args)});await ui.refresh();
  const form=root.querySelector('form');assert.equal(form.elements.apiKey.value,'');assert.match(root.textContent,/stored securely/);
  form.elements.trunkId.value='33333333-3333-3333-3333-333333333333';form.elements.approvalReference.value='Approval';form.elements.cliRightsConfirmed.checked=true;
  form.querySelector('[name=number]').value='+12145550123';form.querySelector('[name=evidence]').value='Carrier assignment';
  await form.onsubmit({preventDefault(){}});
  assert.equal(requests[0][0],'/api/admin/carriers/didww/ip-only');assert.equal(requests[0][2],'PUT');assert.equal(requests[0][1].assignments[0].userId,user);assert.equal(requests[0][1].assignments[0].number,'+12145550123');assert.equal(requests[0][1].expectedRevision,0);
  assert.ok(!('tenantId' in requests[0][1]));
 }finally{globalThis.document=oldDocument;globalThis.FormData=oldForm;dom.window.close();}
});
