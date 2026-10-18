import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupCallGui} from './callGui.js';
test('in-call Video requests same-session upgrade and recipient gets accept/decline controls',async()=>{
 const dom=new JSDOM('<section id="incoming"><button id="answer">Answer</button><button id="reject">Reject</button></section><section id="active"><button id="hangup">End</button></section>');
 const document=dom.window.document,sent=[];
 const session={state:'Established',delegate:{},sessionDescriptionHandlerOptionsReInvite:{},info:async options=>sent.push(JSON.parse(options.requestOptions.body.content))};
 const phone={session,localMediaStream:{getVideoTracks:()=>[]},remoteMediaStream:null};
 let meetings=0;const gui=setupCallGui({document,getPhone:()=>phone,openVideo:()=>meetings++});
 try {
  gui.active(true);document.querySelector('.call-video-toggle').click();await new Promise(r=>setImmediate(r));
  assert.equal(meetings,0);assert.equal(sent[0].action,'request');assert.equal(document.querySelector('.call-video-toggle').disabled,true);
  gui.active(false);gui.active(true);
  session.delegate.onInfo({request:{getHeader:()=> 'application/vnd.olamide.video+json',body:JSON.stringify({action:'request',id:'12345678-1234-1234-1234-123456789012'})},accept:async()=>{},reject:async()=>{}});
  await new Promise(r=>setImmediate(r));assert.equal(document.querySelector('.sip-video-prompt').hidden,false);
  document.querySelector('[data-decline]').click();await new Promise(r=>setImmediate(r));assert.equal(document.querySelector('.sip-video-prompt').hidden,true);assert.equal(sent.at(-1).action,'decline');
 } finally {gui.dispose();dom.window.close();}
});
