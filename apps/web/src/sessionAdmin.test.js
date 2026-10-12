import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupSessionAdmin} from './sessionAdmin.js';
test('super admin session GUI loads limits and saves selected user to backend',async()=>{
 const dom=new JSDOM('<section id="user-session-admin" hidden><button id="session-policy-refresh"></button><form id="session-policy-form"><select id="session-policy-user"></select><input name="maxSessions"><button type="submit">Save</button></form><p id="session-policy-status"></p><p id="session-policy-count"></p></section>');
 const saved=globalThis.fetch,calls=[];
 globalThis.fetch=async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>options?.method?{maxSessions:2,revokedSessions:1}:{users:[{id:'u',display_name:'Alice',email:'a@example.com',max_sessions:1,active_sessions:1}]}};};
 try{const gui=setupSessionAdmin(dom.window.document);await gui.refresh({role:'admin'});assert.equal(calls.length,0);await gui.refresh({role:'super_admin'});const form=dom.window.document.getElementById('session-policy-form');form.elements.maxSessions.value='2';await form.onsubmit({preventDefault(){}});const mutation=calls.find(c=>c.options?.method);assert.equal(mutation.path,'/api/admin/user-sessions/u');assert.deepEqual(JSON.parse(mutation.options.body),{maxSessions:2});assert.match(dom.window.document.getElementById('session-policy-status').textContent,/1 earlier session/);}finally{globalThis.fetch=saved;dom.window.close();}
});
