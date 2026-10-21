import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {emergencyDialNumber,setupNativeEmergency} from './nativeEmergency.js';
test('recognizes emergency keypad numbers without reclassifying ordinary or explicit SIP calls',()=>{
 for(const code of ['911','112','999','000','10111'])assert.equal(emergencyDialNumber(code),code);
 for(const value of ['234805875044','011234805875044','+1911','sip:911@example.com','alice'])assert.equal(emergencyDialNumber(value),null);
});
function fixture(){const dom=new JSDOM('<form><input name="target"></form>');const document=dom.window.document,form=document.querySelector('form'),input=form.elements.target;const native=[],sip=[];setupNativeEmergency({document,form,input,openNative:uri=>native.push(uri)});form.addEventListener('submit',e=>{e.preventDefault();sip.push(input.value);});return {dom,document,form,input,native,sip,submit:()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))};}
test('native handoff intercepts emergency before SIP and exposes retry link',()=>{
 const f=fixture();f.input.value='911';f.submit();assert.deepEqual(f.native,['tel:911']);assert.deepEqual(f.sip,[]);assert.equal(f.document.querySelector('a').href,'tel:911');assert.match(f.document.body.textContent,/cannot confirm/);
 f.input.value='112';f.submit();assert.equal(f.document.querySelectorAll('section').length,1);
});
test('normal dialing and explicit SIP target retain their existing path',()=>{
 const f=fixture();f.input.value='19452205026';f.submit();assert.equal(f.sip.length,1);assert.equal(f.native.length,0);
 f.input.value='911';f.input.dataset.routeTarget='sip:alice@example.com';f.submit();assert.equal(f.sip.length,2);assert.equal(f.native.length,0);
});
test('location lookup is optional, fresh, and never changes emergency destination',()=>{
 const f=fixture();let geoCalls=0;
 Object.defineProperty(f.dom.window.navigator,'geolocation',{value:{getCurrentPosition:(success,error,options)=>{geoCalls++;assert.equal(options.maximumAge,0);success({coords:{latitude:32.8,longitude:-96.8}});}}});
 f.input.value='911';f.submit();assert.equal(geoCalls,0);
 f.document.querySelector('button').click();assert.equal(geoCalls,1);assert.deepEqual(f.native,['tel:911']);assert.match(f.document.querySelector('a[target]').href,/google.com\/maps/);
});
