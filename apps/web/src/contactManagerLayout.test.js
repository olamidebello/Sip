import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupContactManagerLayout} from './contactManagerLayout.js';
test('contact actions open their group and preserve existing form handlers',()=>{
 const {window}=new JSDOM(`<details id="contact-directory"><summary>Old title</summary><form id="user-directory-search"><input></form><ul id="user-directory-results"></ul><form id="contact-presence-settings"></form><button id="contact-settings-refresh"></button><h3>Address book</h3><button id="phone-contact-import"></button><form id="add-contact"><input></form><div class="bulk-controls"><input id="contacts-file"></div><p id="contact-directory-status"></p></details>`);const doc=window.document,form=doc.getElementById('add-contact');let fired=false;form.onsubmit=()=>{fired=true;};const manager=setupContactManagerLayout(doc);manager.open('add');assert.equal(doc.querySelector('[data-contact-group=add]').open,true);assert.equal(doc.querySelector('[data-contact-group=privacy]').open,false);assert.equal(doc.querySelector('[data-contact-group=find]').open,false);form.dispatchEvent(new window.Event('submit'));assert.equal(fired,true);manager.open('import');assert.ok(doc.querySelector('[data-contact-group=import] #phone-contact-import'));assert.equal(doc.querySelector('summary').textContent,'Contacts');
});
