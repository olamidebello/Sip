import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupCallGui} from './callGui.js';
test('overlays retain SIP handlers and minimize without ending media',()=>{
  const dom=new JSDOM('<div class="chat-thread-header"><button aria-label="Conversation menu"></button></div><section id="incoming" hidden><strong>Incoming</strong><button id="answer">Answer</button><button id="reject">Reject</button></section><section id="active" hidden><button id="hangup">Hang up</button></section><div id="meeting-live" hidden></div>');
  const document=dom.window.document;let answered=0,video=0;document.getElementById('answer').onclick=()=>answered++;
  const ui=setupCallGui({document,openVideo:()=>video++});
  try{
    ui.number('sip:+15551234567@example.com');ui.identity('Alice');assert.equal(document.querySelector('.call-number').textContent,'+15551234567');assert.equal(document.querySelector('.call-hero h3').textContent,'Alice');
    document.getElementById('answer').click();assert.equal(answered,1);document.querySelector('.chat-video-call').click();assert.equal(video,1);
    document.getElementById('incoming').hidden=false;ui.active(true);assert.equal(document.getElementById('incoming').hidden,true);
    assert.equal(document.querySelector('.call-duration').textContent,'00:00');
    document.querySelector('#active .call-minimize').click();assert.ok(document.getElementById('active').classList.contains('call-minimized'));
    document.querySelector('.video-minimize').click();assert.ok(document.getElementById('meeting-live').classList.contains('video-minimized'));
    ui.active(false);assert.equal(document.querySelector('.call-duration').textContent,'');
  }finally{ui.dispose();dom.window.close();}
});
test('outgoing screen shows pending state and keypad uses existing tone handler only after connection',()=>{
 const dom=new JSDOM('<div class="chat-thread-header"></div><section id="incoming" hidden><button id="answer">Answer</button><button id="reject">Reject</button></section><section id="active" hidden><button id="hold">Hold</button><button id="mute">Mute</button><button id="hangup">Hang up</button><input id="tone"><button id="send-tone">Send tone</button></section>');const document=dom.window.document;let tones=[],audio=0;document.getElementById('send-tone').onclick=()=>tones.push(document.getElementById('tone').value);const ui=setupCallGui({document,openVideo(){},openAudio:()=>audio++});try{ui.pending();assert.equal(document.getElementById('active').hidden,false);assert.equal(document.querySelector('.call-keypad-toggle').disabled,true);assert.equal(document.getElementById('hold').disabled,true);ui.active(true);document.querySelector('.call-keypad-toggle').click();document.querySelector('.call-keypad button').click();assert.deepEqual(tones,['1']);document.querySelector('.call-audio-output').click();assert.equal(audio,1);ui.active(false);assert.equal(document.querySelector('.call-keypad-toggle').disabled,true);}finally{ui.dispose();dom.window.close();}
});
