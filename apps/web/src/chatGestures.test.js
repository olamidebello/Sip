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
test('holding reveals only that message, swipe in either direction replies to the exact bubble',async()=>{
 const dom=new JSDOM('<section id="chat"><div class="message-bubble" data-id="a"><p>First</p><div class="message-actions"><button>Reply</button></div></div><div class="message-bubble" data-id="b"><p>Second</p><div class="message-actions"><button>Reply</button></div></div></section>');const document=dom.window.document,bubbles=[...document.querySelectorAll('.message-bubble')],replies=[];for(const bubble of bubbles)bubble.querySelector('button').onclick=()=>replies.push(bubble.dataset.id);
 const gestures=setupChatGestures(document,{holdMs:10});
 function pointer(bubble,name,x,y){const event=new dom.window.Event(name,{bubbles:true});Object.assign(event,{button:0,pointerId:1,clientX:x,clientY:y});bubble.querySelector('p').dispatchEvent(event);}
 try{pointer(bubbles[1],'pointerdown',0,0);await new Promise(r=>setTimeout(r,20));assert.equal(bubbles[1].getAttribute('aria-expanded'),'true');assert.ok(!bubbles[0].classList.contains('message-selected'));pointer(bubbles[1],'pointerup',0,0);
 pointer(bubbles[0],'pointerdown',0,0);pointer(bubbles[0],'pointerup',80,0);pointer(bubbles[1],'pointerdown',80,0);pointer(bubbles[1],'pointerup',0,0);assert.deepEqual(replies,['a','b']);
 pointer(bubbles[0],'pointerdown',0,0);pointer(bubbles[0],'pointermove',0,40);pointer(bubbles[0],'pointerup',80,0);assert.deepEqual(replies,['a','b']);
 }finally{gestures.dispose();dom.window.close();}
});
test('keyboard opens message actions and pointer cancellation prevents delayed selection',async()=>{
 const dom=new JSDOM('<section id="chat"><div class="message-bubble" tabindex="0"><p>Message</p><div class="message-actions"><button>Reply</button></div></div></section>');const document=dom.window.document,bubble=document.querySelector('.message-bubble'),gestures=setupChatGestures(document,{holdMs:10});
 try{bubble.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(bubble.getAttribute('aria-expanded'),'true');document.getElementById('chat').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(bubble.getAttribute('aria-expanded'),'false');const event=new dom.window.Event('pointerdown',{bubbles:true});Object.assign(event,{button:0,pointerId:1,clientX:0,clientY:0});bubble.dispatchEvent(event);bubble.dispatchEvent(new dom.window.Event('pointercancel',{bubbles:true}));await new Promise(r=>setTimeout(r,20));assert.equal(bubble.getAttribute('aria-expanded'),'false');}finally{gestures.dispose();dom.window.close();}
});
