import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupFlowrouteSetup} from './flowrouteSetup.js';
function fixture(role='super_admin'){
 const dom=new JSDOM('<main></main>'),document=dom.window.document,calls=[];let owner='owner';
 const ui=setupFlowrouteSetup({document,parent:document.querySelector('main'),getRole:()=>role,getUserId:()=>owner,get:async()=>({configured:false,revision:0}),request:async(path,body,method)=>{calls.push([path,body,method]);return path.endsWith('/provision')?{status:'active'}:{revision:1};}});
 return {dom,document,calls,ui,logout:()=>{owner=null;}};
}
test('Flowroute form saves password only in request then provisions through existing carrier API',async()=>{
 const f=fixture();await f.ui.refresh();const form=f.document.querySelector('form');
 assert.equal(form.elements.sipPassword.type,'password');assert.equal(form.elements.sipPassword.value,'');
 form.elements.sipPassword.value='test-password-only';form.elements.techPrefix.value='12345678';
 await f.document.querySelector('[data-provision]').onclick();
 assert.equal(f.calls.length,2);assert.equal(f.calls[0][0],'/api/admin/carriers/flowroute/trunk');assert.equal(f.calls[0][1].sipPassword,'test-password-only');assert.equal(f.calls[0][1].authenticationMode,'digest');assert.equal(f.calls[0][1].expectedRevision,0);
 assert.equal(f.calls[1][0],'/api/admin/carriers/flowroute/trunk/provision');assert.equal(form.elements.sipPassword.value,'');assert.match(f.document.querySelector('[role=status]').textContent,/switch acknowledged/);f.dom.window.close();
});
test('ordinary Admin cannot save credentials; signout clears password',async()=>{
 const f=fixture('admin');await f.ui.refresh();f.document.querySelector('[name=sipPassword]').value='private';
 await f.document.querySelector('form').onsubmit({preventDefault(){}});assert.equal(f.calls.length,0);
 f.logout();await f.ui.refresh();assert.equal(f.document.querySelector('[name=sipPassword]').value,'');assert.equal(f.document.querySelector('section').hidden,true);f.dom.window.close();
});
