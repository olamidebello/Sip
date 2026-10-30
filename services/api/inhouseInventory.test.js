import test from 'node:test';import assert from 'node:assert/strict';import {validateInventoryAction,manageInhouseInventory,handleInhouseActivationAdmin} from './inhouseActivation.js';
const tenant='tenant',user={id:'admin',tenant_id:tenant,role:'super_admin'},didId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
test('provisioning validates licensed range, batch boundary and audit reason',()=>{
 assert.throws(()=>validateInventoryAction({action:'provision',reason:'x',number:'+12109050290',count:1}));
 assert.throws(()=>validateInventoryAction({action:'provision',reason:'x',number:'+2342031509999',count:2}));
 assert.throws(()=>validateInventoryAction({action:'assign',reason:'',didId,userId}));
 assert.equal(validateInventoryAction({action:'provision',reason:'licensed',number:'+2342031500000',count:10}).count,10);
});
function fake({assigned=false,verified=true,entitled=true}={}){
 const statements=[];const db={release(){},async query(sql,args){
 statements.push([sql,args]);
 if(sql.startsWith('SELECT policy'))return {rows:[]};
 if(sql.startsWith('SELECT id FROM users'))return {rows:[{id:userId}]};
 if(sql.startsWith('SELECT 1 FROM subscriptions'))return {rows:[{ok:1}]};
 if(sql.startsWith('SELECT did_id FROM inhouse_subscriber_assignments'))return {rows:[]};
 if(sql.startsWith('SELECT id,number_e164,status,user_id'))return {rows:[{id:didId,number_e164:'+2342031500000',status:assigned?'assigned':'available',user_id:assigned?'someone':null}]};
 if(sql.startsWith('SELECT number_e164 FROM inhouse_nigeria_verifications'))return {rows:verified?[{number_e164:'+2348012345678'}]:[]};
 if(sql.startsWith('SELECT tenant_id FROM did_requested_blocks'))return {rows:entitled?[{tenant_id:tenant}]:[]};
 return {rows:[]};
 }};return {statements,connect:async()=>db};
}
test('manual assignment reserves verified activation, keeps pending state and never charges wallet',async()=>{
 const pool=fake();const result=await manageInhouseInventory(pool,user,{action:'assign',didId,userId,reason:'Support allocation'});
 assert.equal(result.state,'pending');assert.ok(pool.statements.some(([s])=>s.startsWith('INSERT INTO inhouse_activation_history')));
 assert.ok(pool.statements.some(([s])=>s.startsWith('INSERT INTO inhouse_admin_actions')));
 assert.ok(!pool.statements.some(([s])=>/wallet|INSERT INTO invoices/i.test(s)));
});
test('owned DID, unverified subscriber and unlicensed provisioning roll back',async()=>{
 for(const [opts,input] of [[{assigned:true},{action:'assign',didId,userId,reason:'x'}],[{verified:false},{action:'assign',didId,userId,reason:'x'}],[{entitled:false},{action:'provision',number:'+2342031500000',count:1,reason:'x'}]]){
 const pool=fake(opts);await assert.rejects(manageInhouseInventory(pool,user,input));assert.ok(pool.statements.some(([s])=>s==='ROLLBACK'));assert.ok(!pool.statements.some(([s])=>s==='COMMIT'));
 }
});
test('inventory POST rejects non-super-admin before reading body or touching database',async()=>{
 let status;await handleInhouseActivationAdmin({req:{method:'POST'},res:{},user:{role:'admin'},send:(_r,s)=>status=s,pool:{query(){throw Error('unexpected');}}});assert.equal(status,403);
});
