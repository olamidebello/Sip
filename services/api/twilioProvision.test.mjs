import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureResource,client,validateProvision,provisionResources} from './twilioProvision.mjs';
const tenant='00000000-0000-4000-8000-000000000000',account='AC'+'1'.repeat(32),remote='MG'+'2'.repeat(32);
const config={tenantId:tenant,publicIp:'154.29.77.102',domain:'smooth-test.pstn.twilio.com'};
function scenario({items=[],prior=[],apply=true,fail=false}={}){
 const writes=[],calls=[],changes=[];
 const db={query:async(sql,args)=>{if(sql.startsWith('SELECT'))return {rows:prior};writes.push({sql,args});return {rows:[]};}};
 const request=async(base,path,form)=>{calls.push({base,path,form});if(!form)return {services:items};if(fail)throw Error('timeout');return {sid:remote,account_sid:account};};
 const options={db,tenant,account,name:'SMS',base:'messaging',path:'/v1/Services',listKey:'services',identity:r=>r.friendly_name==='wanted',form:{FriendlyName:'wanted'},request,apply,changes};
 return {options,writes,calls,changes};
}
test('plan performs no POST and writes no jobs',async()=>{const s=scenario({apply:false});assert.equal((await ensureResource(s.options)).planned,true);assert.equal(s.calls.length,1);assert.equal(s.writes.length,0);});
test('existing unique resource is adopted without creating another',async()=>{const s=scenario({items:[{sid:remote,friendly_name:'wanted',account_sid:account}]});assert.equal((await ensureResource(s.options)).sid,remote);assert.equal(s.writes.length,0);});
test('successful creation persists intent before POST then created SID',async()=>{const s=scenario();await ensureResource(s.options);assert.match(s.writes[0].sql,/starting/);assert.match(s.writes[1].sql,/created/);assert.deepEqual(s.changes,['SMS']);});
test('timeout becomes unknown and a rerun never submits again',async()=>{const s=scenario({fail:true});await assert.rejects(ensureResource(s.options),/not be automatically repeated/);assert.match(s.writes[1].sql,/unknown/);const rerun=scenario({prior:[{status:'unknown'}]});await assert.rejects(ensureResource(rerun.options),/reconcile/);assert.equal(rerun.calls.length,1);});
test('starting jobs and missing created resources are not replayed',async()=>{for(const status of ['starting','created']){const s=scenario({prior:[{status}]});await assert.rejects(ensureResource(s.options),/reconcile/);assert.equal(s.writes.length,0);}});
test('ambiguous matching resources block creation',async()=>{const s=scenario({items:[{friendly_name:'wanted'},{friendly_name:'wanted'}]});await assert.rejects(ensureResource(s.options),/Ambiguous/);assert.equal(s.writes.length,0);});
test('incomplete listings and wrong schema block mutation',async()=>{for(const listing of [{services:[],next_page_uri:'/next'},{services:[],meta:{next_page_url:'https://example.invalid'}},{}]){const s=scenario();s.options.request=async()=>listing;await assert.rejects(ensureResource(s.options));assert.equal(s.writes.length,0);}});
test('cross-account resource is never adopted',async()=>{const s=scenario({items:[{sid:remote,friendly_name:'wanted',account_sid:'AC'+'3'.repeat(32)}]});await assert.rejects(ensureResource(s.options),/account mismatch/);});
test('fixed endpoint client rejects arbitrary hosts and strips remote error contents',async()=>{const api=client({accountSid:account,authToken:'private'},async()=>({ok:false,status:403,json:async()=>({code:20003,message:'private secret'})}));await assert.rejects(api('evil','/'),/Invalid/);await assert.rejects(api('api','/v1'),e=>!e.message.includes('private')&&e.message.includes('403'));});
test('public IP and exact origination address required',()=>{assert.equal(validateProvision(config).publicIp,config.publicIp);for(const publicIp of ['127.0.0.1','10.0.0.1','172.16.1.2','192.168.1.2','0.0.0.0'])assert.throws(()=>validateProvision({...config,publicIp}));assert.throws(()=>validateProvision({...config,originationUri:'sip:evil.example'}));});
test('inactive account blocks all resource provisioning',async()=>{let calls=0;await assert.rejects(provisionResources({db:{},config,credentials:{accountSid:account,authToken:'private'},apply:true,fetcher:async()=>{calls++;return {ok:true,json:async()=>({sid:account,status:'suspended'})};}}),/Active matching/);assert.equal(calls,1);});
