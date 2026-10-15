import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {dialTarget,setupDialpad} from './dialpad.js';
test('numbers and extensions use the assigned domain; full SIP addresses stay intact',()=>{
  assert.equal(dialTarget('+1 (555) 123-4567','sip.example'),'sip:+15551234567@sip.example');
  assert.equal(dialTarget('101','sip.example'),'sip:101@sip.example');
  assert.equal(dialTarget('sip:bob@other.example','sip.example'),'sip:bob@other.example');
  assert.throws(()=>dialTarget('https://example','sip.example'));
  assert.throws(()=>dialTarget('101',''));
});
test('keypad edits destination before calls and sends tones during calls',async()=>{
  const dom=new JSDOM('<input><div id="pad"></div>');
  try{
    const input=dom.window.document.querySelector('input'),root=dom.window.document.querySelector('#pad');
    let active=false;const tones=[];
    setupDialpad({root,input,inCall:()=>active,sendTone:async digit=>tones.push(digit),onError:error=>{throw error;}});
    assert.equal(root.querySelectorAll('[data-digit]').length,12);
    root.querySelector('[data-digit="1"]').click();root.querySelector('[data-digit="2"]').click();assert.equal(input.value,'12');assert.equal(root.querySelector('output').textContent,'12');
    input.setSelectionRange(0,1);root.querySelector('[data-digit="9"]').click();assert.equal(input.value,'92');
    active=true;root.querySelector('[data-digit="#"]').click();await Promise.resolve();assert.deepEqual(tones,['#']);assert.equal(input.value,'92');
    active=false;input.setSelectionRange(2,2);root.querySelectorAll('button')[12].click();assert.equal(input.value,'9');
    root.querySelectorAll('button')[13].click();assert.equal(input.value,'');assert.equal(root.querySelector('output').textContent,'Enter a number');
  }finally{dom.window.close();}
});

test('backspace respects selection and keyboard digits send tones without editing the destination',async()=>{
 const dom=new JSDOM('<input value="12345"><div></div>');
 try{
  const input=dom.window.document.querySelector('input'),root=dom.window.document.querySelector('div');let active=false;const tones=[];
  setupDialpad({root,input,inCall:()=>active,sendTone:async digit=>tones.push(digit),onError:assert.fail});
  input.setSelectionRange(1,4);root.querySelector('.dialpad-backspace').click();assert.equal(input.value,'15');
  active=true;const event=new dom.window.KeyboardEvent('keydown',{key:'#',cancelable:true});input.dispatchEvent(event);await Promise.resolve();assert.equal(event.defaultPrevented,true);assert.deepEqual(tones,['#']);assert.equal(input.value,'15');
 }finally{dom.window.close();}
});
