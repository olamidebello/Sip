import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';
test('end users default to four reference tabs and cannot bypass hidden extras through hashes or form paths',async()=>{
 const app=await appFixture({navigationExtras:{}});try{await app.signIn('user');
 assert.deepEqual([...app.document.querySelectorAll('.messenger-tabs a span')].map(node=>node.textContent),['Chats','Updates','Communities','Calls']);
 assert.equal(app.window.audit.showWorkspace('money'),false);assert.equal(app.window.audit.showWorkspace('dashboard'),false);
 assert.equal(app.document.querySelector('.configuration-links'),null);
 app.document.querySelector('[aria-label="Open menu"]').click();assert.ok(!app.document.getElementById('messenger-overflow').textContent.includes('More tools'));
 app.window.audit.pageRoutes.go('planner-form');assert.equal(app.window.location.hash,'#chat');
 }finally{app.close();}
});
test('granted Money navigation appears without granting administrator pages',async()=>{
 const app=await appFixture({navigationExtras:{money:true}});try{await app.signIn('user');assert.ok(app.document.querySelector('.messenger-tabs a[href="/#money"]'));assert.equal(app.window.audit.showWorkspace('money'),true);assert.equal(app.window.audit.showWorkspace('navigation-policy-admin'),false);}finally{app.close();}
});
test('Calls reference shortcuts open working dialogs and the call menu uses existing backend controls',async()=>{
 const app=await appFixture({navigationExtras:{}});try{await app.signIn('user');app.window.audit.showWorkspace('calling-workspace');
 const shortcuts=[...app.document.querySelectorAll('.calls-shortcuts button')];assert.deepEqual(shortcuts.map(button=>button.textContent),['Call','Schedule','Keypad','Favorites']);
 shortcuts[1].click();assert.equal(app.document.querySelector('.calls-dialog').open,true);assert.ok(app.document.getElementById('scheduled-call-form').onsubmit);app.document.querySelector('.calls-close').click();
 app.document.querySelector('[aria-label="Open menu"]').click();assert.deepEqual([...app.document.querySelectorAll('#messenger-overflow button')].map(button=>button.textContent),['Clear call log','Scheduled calls','Settings']);
 }finally{app.close();}
});
test('login with a hidden workspace hash falls back to Chats',async()=>{const app=await appFixture({url:'https://sip.example.com/#money',navigationExtras:{}});try{await app.signIn('user');assert.equal(app.window.location.hash,'#chat');assert.equal(app.document.getElementById('chat').closest('.workspace-inactive'),null);}finally{app.close();}});
test('video invitation creation stays wired without adding the Meetings navigation tab',async()=>{const app=await appFixture({navigationExtras:{}});try{await app.signIn('user');app.document.querySelector('.chat-video-call').click();assert.equal(app.document.getElementById('meetings').closest('.workspace-inactive'),null);app.window.audit.showWorkspace('chat');assert.equal(app.window.audit.showWorkspace('meetings'),false);}finally{app.close();}});
