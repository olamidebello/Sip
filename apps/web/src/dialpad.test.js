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
    root.querySelector('[data-digit="1"]').click();root.querySelector('[data-digit="2"]').click();assert.equal(input.value,'12');
    input.setSelectionRange(0,1);root.querySelector('[data-digit="9"]').click();assert.equal(input.value,'92');
    active=true;root.querySelector('[data-digit="#"]').click();await Promise.resolve();assert.deepEqual(tones,['#']);assert.equal(input.value,'92');
    active=false;root.querySelectorAll('button')[12].click();assert.equal(input.value,'9');
    root.querySelectorAll('button')[13].click();assert.equal(input.value,'');
  }finally{dom.window.close();}
});
