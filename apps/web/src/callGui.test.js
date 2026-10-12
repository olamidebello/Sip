import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupCallGui} from './callGui.js';
test('overlays retain SIP handlers and minimize without ending media',()=>{
  const dom=new JSDOM('<div class="chat-thread-header"><button aria-label="Conversation menu"></button></div><section id="incoming" hidden><strong>Incoming</strong><button id="answer">Answer</button><button id="reject">Reject</button></section><section id="active" hidden><button id="hangup">Hang up</button></section><div id="meeting-live" hidden></div>');
  const document=dom.window.document;let answered=0,video=0;document.getElementById('answer').onclick=()=>answered++;
  const ui=setupCallGui({document,openVideo:()=>video++});
  try{
    ui.identity('Alice');assert.equal(document.querySelector('.call-hero h3').textContent,'Alice');
    document.getElementById('answer').click();assert.equal(answered,1);document.querySelector('.chat-video-call').click();assert.equal(video,1);
    document.getElementById('incoming').hidden=false;ui.active(true);assert.equal(document.getElementById('incoming').hidden,true);
    assert.equal(document.querySelector('.call-duration').textContent,'00:00');
    document.querySelector('#active .call-minimize').click();assert.ok(document.getElementById('active').classList.contains('call-minimized'));
    document.querySelector('.video-minimize').click();assert.ok(document.getElementById('meeting-live').classList.contains('video-minimized'));
    ui.active(false);assert.equal(document.querySelector('.call-duration').textContent,'');
  }finally{ui.dispose();dom.window.close();}
});
