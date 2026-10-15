import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {setupTelecomPolicies} from './telecomPolicies.js';import definitions from './telecomPolicyDefinitions.json' with {type:'json'};
test('all policy menus have working create/edit controls, including multiple controls per tariff page',async()=>{
 const targets=[...new Set(Object.values(definitions).map(d=>d.feature))],dom=new JSDOM(targets.map(id=>'<section id="telecom-feature-'+id+'"></section>').join('')),document=dom.window.document,calls=[];
 const workspace=setupTelecomPolicies({document,get:async path=>{const kind=path.split('/').at(-1),def=definitions[kind];return {rows:[{id:'record',revision:2,enabled:true,data:Object.fromEntries(def.fields.map(f=>[f.name,f.type==='number'?60:'<script>']))}]};},request:async(...args)=>calls.push(args)});
 for(const [kind,definition] of Object.entries(definitions)){
  await workspace.refresh('telecom-feature-'+definition.feature);const panel=document.getElementById('telecom-feature-'+definition.feature),form=[...panel.querySelectorAll('form')].find(f=>f.querySelector('h3').textContent===definition.label);
  assert.ok(form);for(const f of definition.fields)form.elements[f.name].value=f.type==='number'?60:'value';await form.onsubmit({preventDefault(){}});assert.equal(calls.at(-1)[0],'/api/admin/telecom/policies/'+kind);assert.equal(calls.at(-1)[2],'POST');
  const list=form.nextElementSibling.nextElementSibling;list.querySelector('button').click();await form.onsubmit({preventDefault(){}});assert.equal(calls.at(-1)[0],'/api/admin/telecom/policies/'+kind+'/record');assert.equal(calls.at(-1)[1].revision,2);assert.equal(document.querySelector('script'),null);
 }
 workspace.stop();assert.equal(document.querySelectorAll('div button').length,0);dom.window.close();
});
