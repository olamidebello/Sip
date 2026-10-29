import test from 'node:test';
import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';
test('SMS sits immediately beside Chats and opens the SMS workspace',async()=>{
 const app=await appFixture({navigationExtras:{'external-sms':true}});
 try{await app.signIn('user');const tabs=[...app.document.querySelectorAll('.messenger-tabs a')];assert.deepEqual(tabs.slice(0,2).map(a=>a.textContent),['Chats','SMS']);assert.equal(tabs[1].getAttribute('href'),'/#external-sms');assert.equal(app.window.audit.showWorkspace('external-sms'),true);assert.equal(app.document.querySelector('.messenger-tabs [aria-current=page]').textContent,'SMS');assert.equal(app.document.getElementById('sms-send').closest('.workspace-inactive'),null);}finally{app.close();}
});
test('administrator-hidden SMS remains unavailable in navigation and direct routes',async()=>{
 const app=await appFixture({navigationExtras:{'external-sms':false}});try{await app.signIn('user');assert.equal(app.document.querySelector('.messenger-tabs a[href="/#external-sms"]'),null);assert.equal(app.window.audit.showWorkspace('external-sms'),false);}finally{app.close();}
});
