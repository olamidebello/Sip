import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupMediaComposer,appendAttachment} from './messengerMedia.js';
test('media renders safe authenticated URLs and touch recording cancel/lock stops microphone',async()=>{
 const dom=new JSDOM('<form><textarea name="body"></textarea><button>Send</button></form><div id="preview"></div>');const document=dom.window.document;
 appendAttachment(document,document.getElementById('preview'),{attachment_id:'file-id',attachment_mime:'image/png',attachment_name:'<script>attack</script>'});assert.equal(document.querySelector('img').getAttribute('src'),'/api/messenger/attachments/file-id');assert.equal(document.querySelector('script'),null);
 let stops=0,active,calls=0;const stream={getTracks:()=>[{stop:()=>stops++}]};Object.defineProperty(dom.window.navigator,'mediaDevices',{value:{getUserMedia:async()=>stream}});
 class Recorder{static isTypeSupported(){return true;}constructor(){active=this;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.onstop();}}dom.window.MediaRecorder=Recorder;
 const media=setupMediaComposer({document,form:document.querySelector('form'),request:async()=>calls++,onError(){}});const record=document.querySelector('button[aria-pressed]');
 const pointer=(name,x,y)=>{const e=new dom.window.Event(name);Object.assign(e,{pointerType:'touch',pointerId:1,clientX:x,clientY:y});record.dispatchEvent(e);};
 try{pointer('pointerdown',0,0);await new Promise(r=>setImmediate(r));assert.equal(active.state,'recording');pointer('pointermove',-100,0);assert.equal(active.state,'inactive');assert.equal(calls,0);assert.equal(stops,1);
 pointer('pointerdown',0,0);await new Promise(r=>setImmediate(r));pointer('pointermove',0,-100);pointer('pointerup',0,-100);assert.equal(active.state,'recording');media.stop();assert.equal(active.state,'inactive');assert.equal(stops,2);assert.equal(calls,0);
 }finally{media.stop();dom.window.close();}
});
