import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupLanguageTools} from './languageTools.js';
test('translation updates only the reviewed draft and does not send a message',async()=>{
 const {window}=new JSDOM('<select id="contact-list"></select><form id="send-message"><textarea name="body">Hello</textarea></form><details class="chat-options"></details><ul id="message-list"></ul>');const requests=[];const old=globalThis.Event;globalThis.Event=window.Event;
 try{const tools=setupLanguageTools({document:window.document,get:async()=>({languages:[{code:'es',name:'Spanish'}]}),request:async(...a)=>{requests.push(a);return {text:'Hola'};}});await window.document.querySelector('[data-action=languages]').onclick();await window.document.querySelector('[data-action=translate]').onclick();assert.equal(window.document.querySelector('textarea').value,'Hola');assert.deepEqual(requests,[['/api/language/translate',{text:'Hello',target:'es'}]]);tools.stop();}finally{globalThis.Event=old;}
});
