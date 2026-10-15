import test from 'node:test';
import assert from 'node:assert/strict';
import {parseToneSequence,createToneSequence,setupAdvancedCalling} from './advancedCalling.js';
import {JSDOM} from 'jsdom';
test('tone sequences validate input before sending and preserve explicit pauses',async()=>{
 assert.deepEqual(parseToneSequence('12 #, 3'),['1','2','#',',','3']);for(const value of ['', 'abc','1;2','1'.repeat(65)])assert.throws(()=>parseToneSequence(value));
 const sent=[],wait=[];const runner=createToneSequence({sendTone:async digit=>sent.push(digit),isActive:()=>true,delay:async ms=>wait.push(ms)});
 assert.equal(await runner.send('1,2#'),true);assert.deepEqual(sent,['1','2','#']);assert.deepEqual(wait,[350,2000,350,350]);
});
test('cancel and call ending prevent remaining tones; concurrent sequences reject',async()=>{
 let resume,active=true;const sent=[];const runner=createToneSequence({sendTone:async digit=>sent.push(digit),isActive:()=>active,delay:()=>new Promise(resolve=>{resume=resolve;})});
 const pending=runner.send('123');await Promise.resolve();await assert.rejects(runner.send('4'),/already running/);runner.cancel();resume();assert.equal(await pending,false);assert.deepEqual(sent,['1']);
 active=false;await assert.rejects(runner.send('4'),/Connect a call/);
});
test('diagnostics exclude credentials and microphone test releases capture',async()=>{
 const dom=new JSDOM('<section id="softphone-tools"></section>');let stopped=0;
 Object.defineProperty(dom.window.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>stopped++}]})}});
 const ui=setupAdvancedCalling({document:dom.window.document,getPhone:()=>({isConnected:()=>true,password:'secret'}),isActive:()=>false,isRegistered:()=>true,getCall:()=>null});
 try{dom.window.document.querySelector('[data-diagnostics]').click();assert.match(dom.window.document.querySelector('[data-feedback]').textContent,/registration: accepted/);assert.doesNotMatch(dom.window.document.body.textContent,/secret/);dom.window.document.querySelector('[data-mic]').click();await Promise.resolve();await Promise.resolve();assert.equal(stopped,1);ui.reset();assert.equal(dom.window.document.querySelector('[data-feedback]').textContent,'');}finally{dom.window.close();}
});
