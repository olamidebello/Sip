import test from 'node:test';import assert from 'node:assert/strict';import {inhouseNumber,routeIncludedDid,inboundIncludedDid,ensureIncludedDid} from './inhouseSubscriber.js';
test('subscriber assignment allocates one in-house number per verified Nigeria number without wallet or invoice writes',async()=>{
 const queries=[];const db={release(){},async query(sql,args){queries.push([sql,args]);if(sql.includes('inhouse_nigeria_verifications'))return {rows:[{number_e164:'+2348012345678'}]};if(sql.includes('FROM subscriptions'))return {rows:[{}]};if(sql.startsWith('SELECT id,number_e164'))return {rows:[{id:'first',number_e164:'+2342031500001'},{id:'second',number_e164:'+2342031500002'}]};return {rows:[]};}};
 assert.equal(await ensureIncludedDid({connect:async()=>db},{id:'u',tenant_id:'t'}),'+2342031500001');assert.equal(queries.filter(([s])=>s.startsWith('INSERT INTO inhouse_subscriber_assignments')).length,1);assert.equal(queries.some(([s])=>/wallet|invoices/.test(s)),false);assert.equal(queries.at(-1)[0],'COMMIT');
});
test('in-house range normalizes national and E164 numbers exactly',()=>{for(const n of ['+2342031500001','2342031500001','02031500001'])assert.equal(inhouseNumber(n),'+2342031500001');for(const n of ['+2342031550000','+2348012345678','23420315000010'])assert.equal(inhouseNumber(n),null);});
test('on-net routes to active assigned subscriber and never touches wallets',async()=>{
 const sqls=[];const db={async query(sql){sqls.push(sql);if(sql.includes('olamide_sip_call_access'))return {rows:[{tenant_id:'t',user_id:'u'}]};if(sql.includes('inhouse_nigeria_verifications'))return {rows:[{number_e164:'+2348012345678'}]};if(sql.includes('FROM subscriptions'))return {rows:[{}]};if(sql.includes('FROM inhouse_dids'))return {rows:[{user_id:'v',tenant_id:'other',username:'sipuser',domain:'sip.dobhrap.com'}]};return {rows:[]};}};
 const r=await routeIncludedDid(db,{caller:'caller',domain:'sip.dobhrap.com',callKey:'a'.repeat(64),destination:'02031500001'});assert.equal(r[1].route,'extension');assert.equal(r[1].chargeCents,0);assert.equal(sqls.some(s=>/wallet|invoice|pstn_calls/.test(s)),false);
});
test('external inbound accepts only ICN and routes to the unique assigned active subscriber',async()=>{
 const db={async query(sql){if(sql.includes('FROM inhouse_dids'))return {rows:[{user_id:'owner',tenant_id:'t',username:'account',domain:'sip.dobhrap.com'}]};if(sql.includes('inhouse_nigeria_verifications'))return {rows:[{number_e164:'+2348012345678'}]};if(sql.includes('FROM subscriptions'))return {rows:[{}]};return {rows:[]};}};
 assert.equal((await inboundIncludedDid(db,{sourceIp:'1.2.3.4',callKey:'a'.repeat(64),destination:'02031500001'}))[0],403);
 const r=await inboundIncludedDid(db,{sourceIp:'196.216.253.173',callKey:'a'.repeat(64),destination:'02031500001'});assert.equal(r[1].username,'account');assert.equal(r[1].chargeCents,0);
});
test('unassigned in-house number fails closed rather than entering a paid route',async()=>{
 const db={async query(sql){if(sql.includes('olamide_sip_call_access'))return {rows:[{tenant_id:'t',user_id:'u'}]};if(sql.includes('inhouse_nigeria_verifications'))return {rows:[{number_e164:'+2348012345678'}]};if(sql.includes('FROM subscriptions'))return {rows:[{}]};return {rows:[]};}};
 assert.equal((await routeIncludedDid(db,{caller:'caller',domain:'sip.dobhrap.com',destination:'+2342031500001'}))[0],404);assert.equal(await routeIncludedDid(db,{destination:'+2348012345678'}),null);
});

test('included allocation excludes paid rentals and never rewrites their contracted billing',async()=>{
 const queries=[];const db={release(){},async query(sql){queries.push(sql);
  if(sql.includes('FROM inhouse_nigeria_verifications')||sql.includes('FROM subscriptions'))return {rows:[{}]};
  return {rows:[]};
 }};
 assert.equal(await ensureIncludedDid({connect:async()=>db},{id:'u',tenant_id:'t'}),null);
 const selection=queries.filter(s=>s.startsWith('SELECT id,number_e164'));
 assert.equal(selection.length,2);assert(selection.every(s=>s.includes('NOT EXISTS(SELECT 1 FROM smooth_did_rentals')));
 assert(!queries.some(s=>s.startsWith('UPDATE smooth_did_rentals')));
});
