import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupDialingAdmin} from './dialingAdmin.js';
const id='00000000-0000-4000-8000-000000000001',settings={prefixSeven:true,prefixTen:true,prefixOther:true,stripIdd:true,stripTrunk:true};
const flush=()=>new Promise(r=>setTimeout(r,0));
function fixture(){const dom=new JSDOM('<main></main>'),document=dom.window.document,calls=[];let permitted=true;
 const get=async path=>path.endsWith('platform-control')?{users:[{id,email:'u@example.com',phone_e164:'+13105550123'}]}:path.endsWith('/history')?{events:[]}:{settings,defaults:settings,revision:0,inherited:path.includes('/users/')};
 const ui=setupDialingAdmin({document,parent:document.querySelector('main'),get,request:async(...args)=>{calls.push(args);return {validE164:true,internationalNumber:'+13109515282',country:'US'};},isSuper:()=>permitted});
 return {document,calls,ui,setRole:v=>permitted=v,$:s=>document.querySelector(s)};}
test('controls save five settings, reset defaults, provision user override and remove it',async()=>{
 const f=fixture();f.$('[data-users]').click();await flush();f.$('[data-setting="prefixSeven"]').checked=false;f.$('[data-save]').click();await flush();assert.equal(f.calls[0][1].settings.prefixSeven,false);assert.equal(f.calls[0][2],'PUT');
 f.$('[data-default]').click();assert.equal(f.$('[data-setting="prefixSeven"]').checked,true);
 f.$('[data-scope]').value=id;f.$('[data-scope]').onchange();await flush();f.$('[data-save]').click();await flush();assert.match(f.calls.at(-1)[0],new RegExp(id+'$'));
 f.$('[data-inherit]').click();await flush();assert.equal(f.calls.at(-1)[2],'DELETE');
});
test('preview is explicit, selected-user scoped, and role loss prevents mutation',async()=>{
 const f=fixture();f.$('[data-users]').click();await flush();f.$('[data-test]').click();await flush();assert.equal(f.calls.length,0);
 f.$('[data-scope]').value=id;f.$('[data-scope]').onchange();await flush();f.$('[data-preview]').value='9515282';f.$('[data-test]').click();await flush();assert.deepEqual(f.calls[0][1],{userId:id,number:'9515282'});assert.match(f.$('[data-result]').textContent,/No call placed/);
 f.setRole(false);f.ui.clear();f.$('[data-save]').click();await flush();assert.equal(f.calls.length,1);
});
