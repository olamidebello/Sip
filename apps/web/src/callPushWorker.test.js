import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function worker() {
 const handlers={},notifications=[],opened=[],focused=[];
 const self={addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>{},location:{origin:'https://sip.example.com'},registration:{showNotification:async(...args)=>notifications.push(args)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL,Date,Promise,Number});
 return {handlers,self,notifications,opened,focused};
}
test('incoming push produces visible notification without caller-controlled navigation',async()=>{
 const w=worker();let pending;
 w.handlers.push({data:{json:()=>({kind:'incoming_call',callId:'abc',expiresAt:String(Date.now()+45000),url:'https://evil.example'})},waitUntil:p=>pending=p});
 await pending;
 assert.equal(w.notifications[0][0],'Incoming Olamide call');assert.equal(w.notifications[0][1].data.url,'/');
 w.handlers.notificationclick({notification:{close:()=>{},data:{url:'https://evil.example'}},waitUntil:p=>pending=p});await pending;
 assert.deepEqual(w.opened,['/']);
});
test('expired push does not claim the call is still ringing',async()=>{
 const w=worker();let pending;
 w.handlers.push({data:{json:()=>({kind:'incoming_call',expiresAt:'1'})},waitUntil:p=>pending=p});await pending;
 assert.equal(w.notifications[0][0],'Olamide call notification');
});
