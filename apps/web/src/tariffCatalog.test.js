import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {setupTariffCatalog} from './tariffCatalog.js';
test('both menu forms create and edit through their own backend and clear data on sign-out',async()=>{
 const dom=new JSDOM('<section id="telecom-feature-core-call-types"></section><section id="telecom-feature-core-rate-groups"></section>');const document=dom.window.document,calls=[];
 const workspace=setupTariffCatalog({document,get:async()=>({rows:[{id:'record',name:'<script>',description:'description',enabled:true,revision:3}],nextOffset:null}),request:async(...args)=>calls.push(args)});
 for(const [target,kind] of [['core-call-types','call-types'],['core-rate-groups','rate-groups']]){
  const key='telecom-feature-'+target;await workspace.refresh(key);const panel=document.getElementById(key),form=panel.querySelector('form');assert.equal(panel.querySelector('script'),null);
  form.elements.entryName.value='New';await form.onsubmit({preventDefault(){}});assert.equal(calls.at(-1)[0],'/api/admin/tariff-catalog/'+kind);assert.equal(calls.at(-1)[2],'POST');
  panel.querySelector('div button').click();form.elements.entryName.value='Updated';await form.onsubmit({preventDefault(){}});assert.equal(calls.at(-1)[0],'/api/admin/tariff-catalog/'+kind+'/record');assert.equal(calls.at(-1)[1].revision,3);assert.equal(calls.at(-1)[2],'PUT');
 }
 workspace.stop();assert.equal(document.querySelectorAll('div button').length,0);dom.window.close();
});
