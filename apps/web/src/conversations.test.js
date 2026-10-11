import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupConversations} from './conversations.js';
function fixture(data){
 const dom=new JSDOM(`<select id="contact-list"><option value="peer">Peer</option></select><input id="message-search"><ol id="message-list"></ol><p id="chat-status"></p><input id="conversation-blocked" type="checkbox"><input id="conversation-muted" type="checkbox"><input id="conversation-archived" type="checkbox"><p id="conversation-typing"></p><button id="call-contact"></button><div id="message-context"><span id="message-context-text"></span><button id="message-context-cancel"></button></div><form id="send-message"><textarea name="body"></textarea><button>Send</button></form>`,{pretendToBeVisual:true});
 global.document=dom.window.document;const calls=[];let called;
 const api=setupConversations({get:async()=>data,request:async(path,body,method)=>{calls.push({path,body,method});},isSignedIn:()=>true,isVisible:()=>true,preferencesChanged:async()=>{},callContact:address=>{called=address;}});
 api.setContacts([{id:'peer',sip_address:'sip:peer@sip.example'}]);
 return {api,calls,document:dom.window.document,get called(){return called;},close(){api.dispose();dom.window.close();delete global.document;}};
}
const base={viewer:'me',preferences:{blocked:false,muted:false,archived:false},typing:false,reactions:[],messages:[{id:'msg',sender:'me',recipient:'peer',body:'<script>unsafe()</script>',created_at:'2026-10-11T00:00:00Z'}]};
test('chat renders text safely, sends replies and edits to the right backend routes',async()=>{
 const f=fixture(base);try{
 await f.api.refresh();assert.equal(f.document.querySelector('#message-list script'),null);
 const buttons=[...f.document.querySelectorAll('.message-actions button')];
 buttons.find(b=>b.textContent==='Reply').click();await f.api.send('reply');
 assert.deepEqual(f.calls[0],{path:'/api/messages',body:{recipient:'peer',body:'reply',replyTo:'msg'},method:undefined});
 buttons.find(b=>b.textContent==='Edit').click();await f.api.send('changed');
 assert.ok(f.calls.some(c=>c.path==='/api/messages/msg'&&c.method==='PATCH'&&c.body.body==='changed'));
 f.document.querySelector('#call-contact').click();assert.equal(f.called,'sip:peer@sip.example');
 }finally{f.close();}
});
test('blocked conversations disable sending and read receipts acknowledge only displayed incoming messages',async()=>{
 const f=fixture({...base,preferences:{...base.preferences,blocked:true},messages:[{...base.messages[0],sender:'peer',recipient:'me'}]});try{
 await f.api.refresh();assert.equal(f.document.querySelector('#send-message button').disabled,true);
 assert.ok(f.calls.some(c=>c.path==='/api/messages/conversation/peer'&&c.method==='PUT'&&c.body.read===true));
 }finally{f.close();}
});
test('message search and reactions use supported controls and server mutations',async()=>{
 const f=fixture({...base,reactions:[{message_id:'msg',user_id:'peer',reaction:'👍'}]});try{
 await f.api.refresh();assert.equal(f.document.querySelector('.reaction-counts').textContent,'👍 1');
 const select=f.document.querySelector('.message-actions select');select.value='❤️';await select.onchange();
 assert.ok(f.calls.some(c=>c.path==='/api/messages/msg'&&c.method==='PUT'&&c.body.reaction==='❤️'));
 f.document.querySelector('#message-search').value='missing';await f.api.refresh();assert.equal(f.document.querySelector('#message-list').children.length,0);
 }finally{f.close();}
});
