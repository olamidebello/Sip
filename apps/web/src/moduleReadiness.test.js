import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupModuleReadiness} from './moduleReadiness.js';
test('archive GUI queues real jobs, schedules with revision and clears on logout',async()=>{
 const dom=new JSDOM('<section id="telecom-features-admin"></section>'),calls=[];
 try{
  const ui=setupModuleReadiness({document:dom.window.document,get:async path=>path.endsWith('module-audit')?{summary:{apiSourceModules:124,applicationFeatures:86,kamailioModules:266},apiModules:[],appliedSchema:[]}:{archives:[],schedule:null,note:'Ready'},request:async(...args)=>calls.push(args)});
  await ui.refresh();const form=dom.window.document.querySelector('#cdr-archive-create');form.elements.from.value='2026-10-01';form.elements.to.value='2026-10-02';await form.onsubmit({preventDefault(){},currentTarget:form});assert.deepEqual(calls[0],['/api/admin/telecom/archives',{from:'2026-10-01',to:'2026-10-02'}]);
  const schedule=dom.window.document.querySelector('#cdr-archive-schedule');schedule.elements.nextAt.value='2026-10-20T00:00';schedule.elements.enabled.checked=true;await schedule.onsubmit({preventDefault(){}});assert.equal(calls[1][0],'/api/admin/telecom/archives/schedule');assert.equal(calls[1][1].revision,0);assert.equal(calls[1][1].nextAt,'2026-10-20T00:00:00.000Z');
  ui.stop();assert.equal(form.closest('section').hidden,true);
 }finally{dom.window.close();}
});
