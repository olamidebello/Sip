import test from 'node:test';import assert from 'node:assert/strict';import {nigeriaNumber,retentionState,acceptInhouseVerification,inhouseCallEvent,sweepInhouseRetention} from './inhouseLifecycle.js';
test('authenticated matching SMS consumes code once and provisions its bound user',async()=>{
 let consumed=false,allocated=0;const db={release(){},async query(sql){if(sql.startsWith('SELECT *'))return {rows:consumed?[]:[{number_e164:'+2348012345678',user_id:'user',tenant_id:'tenant'}]};if(sql.startsWith('SELECT user_id'))return {rows:[]};if(sql.startsWith('UPDATE inhouse_sms_challenges'))consumed=true;return {rows:[]};}};
 const pool={connect:async()=>db},event={id:'carrier-event',recipient:'+12109050290',sender:'+2348012345678',body:'SMOOTH-'+'A'.repeat(20)},options={allocate:async(_p,u)=>{assert.deepEqual(u,{id:'user',tenant_id:'tenant'});allocated++;}};
 assert.equal(await acceptInhouseVerification(pool,event,options),true);assert.equal(await acceptInhouseVerification(pool,event,options),false);assert.equal(allocated,1);
});
test('expiry clears assignment and verification, imposes seven-day hold, and active calls defer reclaim',async()=>{
 for(const busy of [false,true]){const queries=[],row={did_id:'did',user_id:'user',tenant_id:'tenant',created_at:new Date(Date.now()-31*86400000),qualified_at:null};const db={release(){},async query(sql,args=[]){queries.push([sql,args]);if(sql.startsWith('SELECT did_id'))return {rows:[row]};if(sql.startsWith('SELECT * FROM inhouse_subscriber'))return {rows:[row]};if(sql.startsWith('SELECT 1 FROM pstn_calls'))return {rows:busy?[{}]:[]};return {rows:[]};}};
 await sweepInhouseRetention({query:db.query,connect:async()=>db});const holds=queries.filter(([s])=>s.startsWith('INSERT INTO inhouse_release_holds'));assert.equal(holds.length,busy?0:1);if(!busy){assert.ok(holds[0][1][2].getTime()>=Date.now()+7*86400000-1000);assert.ok(queries.some(([s])=>s.startsWith('DELETE FROM inhouse_nigeria_verifications')));}assert.equal(queries.some(([s])=>s.includes('wallet')),false);
 }
});
test('Nigeria sender validation and retention boundaries',()=>{
 assert.equal(nigeriaNumber('08012345678'),'+2348012345678');assert.equal(nigeriaNumber('+12109050290'),null);
 const created=new Date('2026-01-01T00:00:00Z');assert.equal(retentionState({created_at:created},created.getTime()+23*86400000).warning,true);assert.equal(retentionState({created_at:created},created.getTime()+29*86400000).due,false);assert.equal(retentionState({created_at:created},created.getTime()+30*86400000).due,true);
 assert.equal(retentionState({created_at:created,qualified_at:new Date(created.getTime()+20*86400000)},created.getTime()+30*86400000).due,false);
});
test('wrong destination, non-Nigeria sender and malformed code never reach database',async()=>{
 const pool={connect(){throw Error('must not access DB');}};
 assert.equal(await acceptInhouseVerification(pool,{recipient:'+19999999999',sender:'+2348012345678',body:'SMOOTH-'+'A'.repeat(20)}),false);
 assert.equal(await acceptInhouseVerification(pool,{recipient:'+12109050290',sender:'+18015551234',body:'SMOOTH-'+'A'.repeat(20)}),false);
 assert.equal(await acceptInhouseVerification(pool,{recipient:'+12109050290',sender:'+2348012345678',body:'123456'}),false);
});
test('expired, consumed or wrong-sender challenge cannot verify',async()=>{
 for(const challenge of [null,{number_e164:'+2349012345678'}]){let writes=0;const db={release(){},async query(sql){if(sql.startsWith('SELECT *'))return {rows:challenge?[challenge]:[]};if(sql.startsWith('INSERT')||sql.startsWith('UPDATE'))writes++;return {rows:[]};}};assert.equal(await acceptInhouseVerification({connect:async()=>db},{recipient:'+12109050290',sender:'+2348012345678',body:'SMOOTH-'+'A'.repeat(20)}),false);assert.equal(writes,0);}
});
test('short or failed calls do not extend retention',async()=>{
 for(const event of ['end','failed']){let updated=false;const db={release(){},async query(sql){if(sql.startsWith('SELECT *'))return {rows:[{started_epoch:100,ended_epoch:event==='end'?120:null,caller_user:'u'}]};if(sql.startsWith('UPDATE inhouse_subscriber_assignments'))updated=true;return {rows:[]};}};await inhouseCallEvent({connect:async()=>db},{callKey:'a'.repeat(64),event,epoch:120});assert.equal(updated,false);}
});
