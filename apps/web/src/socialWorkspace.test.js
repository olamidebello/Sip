import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupSocialWorkspace} from './socialWorkspace.js';
test('social renders text safely and publishes replies only on explicit submit',async()=>{
 const {window}=new JSDOM(`<section id="social"><form><textarea name="body"></textarea><button>Post</button></form><p data-social-reply></p><button data-social-cancel></button><input data-social-search><button data-social-refresh></button><button data-social-people></button><ul data-social-profiles></ul><p role="status"></p><div data-social-feed></div></section>`);const calls=[];
 const social=setupSocialWorkspace({document:window.document,get:async()=>({userId:'me',posts:[{id:'p',user_id:'other',name:'Alice',body:'<script>bad</script>',created_at:new Date().toISOString(),likes:0,reposts:0,replies:0}]}),request:async(...args)=>calls.push(args)});
 await social.refresh();assert.equal(window.document.querySelector('script'),null);assert.ok(window.document.querySelector('[data-social-feed]').textContent.includes('<script>bad</script>'));
 window.document.querySelector('.social-actions button').click();assert.equal(calls.length,0);const form=window.document.querySelector('form');form.elements.body.value='Reply';await form.onsubmit({preventDefault(){}});assert.deepEqual(calls[0],['/api/social/posts',{body:'Reply',parentId:'p'}]);social.stop();assert.equal(window.document.querySelector('[data-social-feed]').textContent,'');
});
