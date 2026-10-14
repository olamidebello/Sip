import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupAdapterAdmin} from './adapterAdmin.js';
test('empty targets provide guidance and saving a target fills the selector without exposing its token',async()=>{
 const dom=new JSDOM('<section id="carrier-adapter-admin"><form id="adapter-create"><select name="provider"></select><select name="targetKey"></select><input name="name"><input name="region"><input name="priority"><input name="maxConcurrentCalls"><a id="adapter-configure"></a><details id="adapter-target-configuration"></details><button type="submit"></button></form><p id="adapter-status"></p><div id="adapter-list"></div><div id="adapter-history"></div><button id="adapter-refresh"></button></section>');const old={document:globalThis.document,window:globalThis.window,FormData:globalThis.FormData};globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.FormData=dom.window.FormData;let saved=false;
 try{
 const calls=[];const ui=setupAdapterAdmin({get:async path=>path.endsWith('/targets')?{keyReady:true,targets:saved?[{key:'us-east',url:'https://adapter.example/provision',revision:1,source:'gui'}]:[]}:path==='/api/admin/carriers'?{providers:[{provider:'flowroute',displayName:'Flowroute',enabled:true}]}:{targets:saved?['us-east']:[],nodes:[],assignments:[],operations:[]},request:async(...args)=>{calls.push(args);saved=true;}});await ui.refresh();const create=document.querySelector('#adapter-create');assert.equal(create.querySelector('button[type=submit]').disabled,true);assert.match(create.elements.targetKey.textContent,/Add a private target/);
 const form=document.querySelector('.adapter-target-editor form');form.elements.key.value='us-east';form.elements.url.value='https://adapter.example/provision';form.elements.token.value='x'.repeat(32);await form.onsubmit({preventDefault(){}});
 assert.equal(calls[0][0],'/api/admin/carrier-adapters/targets/us-east');assert.equal(form.elements.token.value,'');assert.equal(create.elements.targetKey.value,'us-east');assert.equal(create.querySelector('button[type=submit]').disabled,false);assert.equal(document.querySelector('form form'),null);
 }finally{Object.assign(globalThis,old);dom.window.close();}
});
