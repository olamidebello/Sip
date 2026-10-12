import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupChatGestures} from './chatGestures.js';
test('horizontal swipe replies, vertical scroll does not, context opens existing actions',()=>{
  const dom=new JSDOM('<section id="chat"><div class="message-bubble"><p>Hello</p><div class="message-actions"><button>Reply</button></div></div></section>');
  const document=dom.window.document,bubble=document.querySelector('.message-bubble');let replies=0;bubble.querySelector('button').onclick=()=>replies++;
  const gestures=setupChatGestures(document);
  const pointer=(name,x,y)=>{const event=new dom.window.Event(name,{bubbles:true});Object.assign(event,{button:0,pointerId:1,clientX:x,clientY:y});bubble.querySelector('p').dispatchEvent(event);};
  try{
    pointer('pointerdown',0,0);pointer('pointerup',80,0);assert.equal(replies,1);
    pointer('pointerdown',0,0);pointer('pointermove',0,80);pointer('pointerup',80,80);assert.equal(replies,1);
    bubble.querySelector('p').dispatchEvent(new dom.window.Event('contextmenu',{bubbles:true,cancelable:true}));assert.ok(bubble.classList.contains('message-selected'));
  }finally{gestures.dispose();dom.window.close();}
});
