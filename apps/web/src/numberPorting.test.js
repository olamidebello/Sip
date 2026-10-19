import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {showNumberPorting} from './numberPorting.js';
const tick=()=>new Promise(r=>setTimeout(r,5));
test('profile provides portability check and collects account-holder authorization',async()=>{
 const dom=new JSDOM('<section id="signed-in-profile"></section>');const calls=[];
 const ui=showNumberPorting({document:dom.window.document,user:{id:'user'},get:async()=>({configured:true,requests:[]}),request:async(path,body)=>{calls.push({path,body});return {portable:true};}});
 try{
 const root=dom.window.document.querySelector('#number-porting');root.querySelector('[name=number]').value='+12125550123';root.querySelector('[data-check]').click();await tick();
 assert.equal(calls[0].path,'/api/account/number-porting/check');assert.match(root.querySelector('[data-portability]').textContent,/confirms portability/);
 assert.equal(root.querySelector('[name=pin]').type,'password');assert.equal(root.querySelector('[name=authorized]').required,true);
 assert.equal(root.querySelector('[name=pin]').value,'');
 }finally{ui.stop();dom.window.close();}
});
test('carrier LOA is text, and submission requires separate explicit authorization',async()=>{
 const dom=new JSDOM('<section id="signed-in-profile"></section>');const calls=[];
 const ui=showNumberPorting({document:dom.window.document,user:{id:'user'},get:async path=>path.endsWith('/loa')?{text:'<script>not HTML</script>',hash:'a'.repeat(64)}:{configured:true,requests:[{id:'request',number:'+12125550123',status:'awaiting_loa'}]},request:async(path,body)=>{calls.push({path,body});return {};}});
 try{
 await ui.refresh();const root=dom.window.document.querySelector('#number-porting');[...root.querySelectorAll('button')].find(b=>b.textContent==='Review and sign LOA').click();await tick();
 assert.equal(root.querySelector('pre').textContent,'<script>not HTML</script>');assert.equal(root.querySelector('script'),null);
 [...root.querySelectorAll('button')].find(b=>b.textContent==='Sign and authorize transfer').click();await tick();assert.equal(calls.length,0);assert.match(root.querySelector('[data-status]').textContent,/Complete the signer/);
 }finally{ui.stop();dom.window.close();}
});
