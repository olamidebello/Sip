import test from 'node:test';import assert from 'node:assert/strict';import {validateBroadcast,audienceHash,handleAlertBroadcasts} from './alertBroadcasts.js';
test('broadcast validates content and binds preview to actor, workspace and exact audience',()=>{
 const b=validateBroadcast({audience:'all',level:'info',title:'Notice',body:'Hello'});assert.equal(audienceHash({id:'a',tenant_id:'t'},b,['2','1']),audienceHash({id:'a',tenant_id:'t'},b,['1','2']));assert.notEqual(audienceHash({id:'a',tenant_id:'t'},b,['1']),audienceHash({id:'a',tenant_id:'other'},b,['1']));assert.throws(()=>validateBroadcast({audience:'all',title:'',body:'x',level:'info'}));
});
test('broadcast administration rejects non-super-admin before touching data',async()=>{let status;await handleAlertBroadcasts({req:{method:'POST'},res:{},user:{role:'admin'},pool:{query(){throw Error('must not query');}},send:(_r,s)=>status=s});assert.equal(status,403);});
test('preview writes no message; confirmed send snapshots recipients and retry does not duplicate',async()=>{
 const user={role:'super_admin',id:'actor',tenant_id:'tenant'},body={audience:'all',level:'info',title:'Notice',body:'Hello'},key='11111111-1111-4111-8111-111111111111';let prior=null,inserts=0,recipientWrites=0;
 const db={release(){},async query(sql,args){
  if(sql.startsWith('SELECT u.id'))return {rows:[{id:'one'},{id:'two'}]};
  if(sql.startsWith('SELECT id,audience_hash'))return {rows:prior?[prior]:[]};
  if(sql.startsWith('INSERT INTO system_alert_broadcasts')){inserts++;prior={id:args[0],audience_hash:args[4],actor_id:args[2]};}
  if(sql.startsWith('INSERT INTO system_alert_recipients'))recipientWrites+=args.length/3;
  return {rows:[]};
 }};const pool={connect:async()=>db};async function call(input){let result;await handleAlertBroadcasts({req:{method:'POST'},res:{setHeader(){}},user,pool,readJson:async()=>input,send:(_r,status,data)=>{result={status,data};}});return result;}
 const preview=await call({...body,action:'preview'});assert.equal(preview.data.recipients,2);assert.equal(inserts,0);
 const input={...body,action:'send',confirm:true,audienceHash:preview.data.audienceHash,requestKey:key};assert.equal((await call({...input,audienceHash:'wrong'})).status,409);assert.equal(inserts,0);
 assert.equal((await call(input)).status,200);assert.equal((await call(input)).data.duplicate,true);assert.equal(inserts,1);assert.equal(recipientWrites,2);
});
