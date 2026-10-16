import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {csvCell,handleCdrArchives,processCdrArchive,enqueueCdrArchive} from './cdrArchive.js';
const id='00000000-0000-4000-8000-000000000001';
const send=(_r,status,body)=>({status,body});
test('CSV export quotes values and neutralizes spreadsheet formulas',()=>{
 assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');assert.equal(csvCell('+15551234567'),'"\'+15551234567"');assert.equal(csvCell('normal'),'"normal"');
});
test('CDR archives deny ordinary administrators before database access',async()=>{
 const r=await handleCdrArchives({req:{method:'GET'},res:{},path:'/api/admin/telecom/archives',user:{role:'admin'},pool:{},send});assert.equal(r.status,403);
});
test('archive downloads cannot cross tenant scope',async()=>{
 let args;const r=await handleCdrArchives({req:{method:'GET'},res:{},path:'/api/admin/telecom/archives/'+id+'/download',user:{role:'super_admin',tenant_id:'other'},pool:{query:async(q,a)=>{args=a;return {rows:[]};}},send});assert.equal(r.status,404);assert.deepEqual(args,[id,'other']);
});
test('archive worker compresses only tenant snapshot rows and never deletes originals',async()=>{
 const calls=[],job={id,tenant_id:'tenant',actor_id:'actor',attempts:0,from_day:'2026-10-01',to_day:'2026-10-01',created_at:new Date('2026-10-02T00:00:00Z')};
 const query=async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT * FROM cdr_archives'))return {rows:[job]};if(sql.startsWith('SELECT u.id'))return {rows:[{id:'actor'}]};if(sql.startsWith('SELECT id,source'))return {rows:[{id,source:'switch',leg_id:'call',caller_e164:'+15551234567',callee_e164:'+15559876543',started_at:new Date('2026-10-01T12:00:00Z')}]};return {rows:[],rowCount:1};};
 await processCdrArchive({query,connect:async()=>({query,release(){}})});
 const select=calls.find(c=>c.sql.startsWith('SELECT id,source'));assert.match(select.sql,/tenant_id=\$1/);assert.match(select.sql,/received_at<=\$4/);assert.equal(select.args[0],'tenant');
 const stored=calls.find(c=>c.sql.includes("status='ready'"));assert.equal(stored.args[0],1);assert.match(stored.args[1],/^[a-f0-9]{64}$/);assert.match(gunzipSync(stored.args[2]).toString(),/switch/);assert.ok(!calls.some(c=>/DELETE FROM cdr_records/.test(c.sql)));
});
test('disabled archive creator cancels the job without reading CDRs',async()=>{
 const calls=[],query=async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT * FROM cdr_archives'))return {rows:[{id,tenant_id:'tenant',actor_id:'actor'}]};return {rows:[],rowCount:1};};
 await processCdrArchive({query,connect:async()=>({query,release(){}})});assert.equal(calls.find(c=>c.sql.startsWith('UPDATE cdr_archives SET status=$1')).args[0],'cancelled');assert.ok(!calls.some(c=>c.sql.includes('FROM cdr_records')));
});
test('scheduler creates one archive per due interval and pauses at storage limit',async()=>{
 for(const count of [0,20]){
 const calls=[],query=async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT s.*'))return {rows:[{tenant_id:'tenant',actor_id:'actor',lookback_days:1,next_at:new Date('2026-10-02T00:00:00Z')}]};if(sql.startsWith('SELECT COUNT'))return {rows:[{n:count}]};return {rows:[],rowCount:1};};
 await enqueueCdrArchive({connect:async()=>({query,release(){}})});
 assert.equal(calls.some(c=>c.sql.startsWith('INSERT IGNORE INTO cdr_archives')),count===0);
 if(count===20)assert.ok(calls.some(c=>c.sql.includes('enabled=FALSE')));
 }
});
