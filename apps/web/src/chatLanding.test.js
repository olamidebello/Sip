import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupChatLanding} from './chatLanding.js';
test('chat sidebar searches contacts and triggers the existing conversation handler',()=>{
  const dom=new JSDOM('<section id="chat"><h2>Chats</h2><p class="messenger-subtitle"></p><details id="contact-directory"></details><select id="contact-list"><option value="a">Alice</option><option value="b">Bob</option></select><ol id="message-list"></ol></section>');
  const document=dom.window.document,select=document.getElementById('contact-list');let selected;
  select.onchange=()=>{selected=select.value;};
  const landing=setupChatLanding(document);
  try{
    document.querySelectorAll('.chat-contact')[1].click();assert.equal(selected,'b');
    const search=document.querySelector('.chat-sidebar>input');search.value='alice';search.dispatchEvent(new dom.window.Event('input'));
    assert.equal(document.querySelectorAll('.chat-contact').length,1);assert.equal(document.querySelector('.chat-name').textContent,'Alice');
    assert.ok(document.getElementById('chat').classList.contains('thread-open'));
    document.querySelector('[aria-label="Back to chats"]').click();assert.equal(document.getElementById('chat').classList.contains('thread-open'),false);
    assert.ok(document.querySelector('.chat-thread #message-list'));
  }finally{landing.dispose();dom.window.close();}
});
test('emoji insertion and conversation overlay preserve composer',()=>{
  const dom=new JSDOM('<section id="chat"><h2>Chats</h2><details id="contact-directory"></details><select id="contact-list"><option value="a">Alice</option></select><ol id="message-list"></ol><form id="send-message"><label><textarea maxlength="4000">Hi there</textarea></label><button>Send</button></form></section>');
  const document=dom.window.document,landing=setupChatLanding(document);
  try{
    const input=document.querySelector('textarea');input.setSelectionRange(3,3);document.querySelector('.chat-emoji-toggle').click();document.querySelector('.chat-emoji-picker button').click();
    assert.equal(input.value,'Hi 😀there');assert.equal(document.querySelector('.chat-emoji-picker').hidden,true);
    const expand=document.querySelector('[aria-label="Expand conversation"]');expand.click();assert.ok(document.getElementById('chat').classList.contains('chat-overlay'));expand.click();assert.equal(document.getElementById('chat').classList.contains('chat-overlay'),false);
  }finally{landing.dispose();dom.window.close();}
});
