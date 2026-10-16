import test from 'node:test';
import assert from 'node:assert/strict';
import {handleModuleAudit} from './moduleAudit.js';
test('module audit requires super admin and distinguishes source evidence from runtime',async()=>{
 const send=(_r,status,body)=>({status,body});assert.equal((await handleModuleAudit({req:{method:'GET'},user:{role:'admin'},pool:{},send})).status,403);
 const r=await handleModuleAudit({req:{method:'GET'},user:{role:'super_admin'},pool:{query:async()=>({rows:[]})},send});assert.equal(r.status,200);assert.equal(r.body.serverInstallation,'unverified');assert.ok(r.body.summary.apiSourceModules>100);assert.equal(r.body.kamailioModules.length,266);assert.ok(r.body.apiModules.every(m=>m.liveAcceptance==='unverified'));
});
