import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupSystemAdminGroup} from './adminGroup.js';
const policy={enabled:true,revision:2,permissions:['users.read','reports.read']};
function fixture(role='super_admin'){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://sip.dobhrap.com/'});let owner='actor',currentRole=role;const calls=[];
 const ui=setupSystemAdminGroup({document:dom.window.document,getUserId:()=>owner,getRole:()=>currentRole,show:()=>{},get:async path=>{
 calls.push(['GET',path]);return path==='/api/account/admin-access'?{policy}:{policy,capabilities:['users.read','reports.read','plans.write'],users:[{id:'actor',email:'owner@example.com',role:'super_admin',status:'active'},{id:'target',email:'dg857641@gmail.com',role:'super_admin',status:'active'}]};
 },request:async(...args)=>{calls.push(args);return {};}});
 return {dom,ui,calls,setRole:v=>{currentRole=v;},setOwner:v=>{owner=v;}};
}
test('Super Admin loads group, saves selected permissions and demotes selected account',async()=>{
 const f=fixture(),document=f.dom.window.document;await f.ui.refresh();const panel=document.getElementById('system-admin-group');assert.equal(panel.hidden,false);
 await panel.querySelector('[data-load]').onclick();const checks=panel.querySelectorAll('[name=permission]');assert.equal(checks.length,3);checks[2].checked=true;
 await panel.querySelector('[data-policy]').onsubmit({preventDefault(){}});
 const saved=f.calls.find(c=>c[0]==='/api/admin/system-admin-group');assert.equal(saved[2],'PUT');assert.equal(saved[1].revision,2);assert.ok(saved[1].permissions.includes('plans.write'));
 const form=panel.querySelector('[data-member]');form.elements.user.value='target';form.elements.role.value='admin';await form.onsubmit({preventDefault(){},currentTarget:form});
 assert.ok(f.calls.some(c=>c[0]==='/api/admin/system-admin-group/users/target'&&c[1].role==='admin'));f.dom.window.close();
});
test('ordinary Admin cannot submit Super Admin forms and sees only delegated tools',async()=>{
 const f=fixture('admin'),document=f.dom.window.document;await f.ui.refresh();assert.equal(document.getElementById('system-admin-group').hidden,true);assert.equal(document.getElementById('delegated-admin-panel').hidden,false);
 await document.querySelector('[data-policy]').onsubmit({preventDefault(){}});assert.equal(f.calls.some(c=>c[2]==='PUT'),false);
 assert.match(document.getElementById('delegated-admin-panel').textContent,/View users/);assert.doesNotMatch(document.getElementById('delegated-admin-panel').textContent,/Create or edit plan/);
 f.setOwner(null);await f.ui.refresh();assert.equal(document.getElementById('system-admin-group').hidden,true);assert.equal(document.getElementById('delegated-admin-panel').hidden,true);f.dom.window.close();
});
