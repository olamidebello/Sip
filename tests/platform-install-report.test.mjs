import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,report} from '../tools/platform-install-report.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
test('partial and dependent features never become implemented or live',()=>{
 const rows=['implemented','partial','not_implemented','external_dependency'].map((implementation,i)=>({id:String(i),name:'Feature '+i,implementation}));
 const r=summarize(rows);assert.equal(r.total,4);assert.deepEqual(r.outstanding,['1','2','3']);assert.equal(r.counts.implemented,1);assert(r.features.every(f=>f.liveAcceptance==='unverified'));
});
test('unknown inventory states stop the report instead of implying readiness',()=>assert.throws(()=>summarize([{id:'x',name:'x',implementation:'live'}]),/Unrecognized/));
test('missing tables and files are reported without exposing credentials',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'olamide-report-'));
 try{fs.writeFileSync(path.join(root,'telecomFeatureCatalog.json'),JSON.stringify([{id:'x',name:'x',implementation:'partial'}]));
 const db={query:async sql=>({rows:sql==='SHOW TABLES'?[{Tables_in_app:'users'}]:[{component:'base',applied_at:'2026-10-23'}]})};
 const r=await report(db,root);assert.equal(r.schema.requiredTables.find(x=>x.name==='users').present,true);assert.equal(r.schema.requiredTables.find(x=>x.name==='sessions').present,false);assert.equal(r.modules['twilioHub.js'],false);assert.equal(r.live,false);assert.equal(r.allFeaturesComplete,false);assert(!JSON.stringify(r).includes('MYSQL_URL'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
