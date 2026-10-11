import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';
test('the actual conversation form survives async submission and clears its draft',async()=>{
 const fixture=await appFixture();try{
 const {window,document}=fixture;
 const original=window.fetch;
 window.fetch=async(path,options={})=>{
   if(path.startsWith('/api/messages'))return {ok:true,status:200,json:async()=>options.method?{id:'new'}:{viewer:'audit-user',messages:[],reactions:[],preferences:{blocked:false,muted:false,archived:false},typing:false}};
   return original(path,options);
 };
 await fixture.signIn('user');window.audit.showWorkspace('chat');
 const list=document.querySelector('#contact-list'),option=document.createElement('option');option.value='peer';option.textContent='Peer';list.append(option);list.value='peer';
 const form=document.querySelector('#send-message');form.elements.body.value='A working conversation';
 form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(form.elements.body.value,'');assert.equal(document.querySelector('#chat-status').textContent,'Message sent');
 }finally{fixture.close();}
});
