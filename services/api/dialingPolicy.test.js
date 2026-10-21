import test from 'node:test';
import assert from 'node:assert/strict';
import {dialingDefaults,validateDialingSettings,readDialingPolicy,handleDialingPolicy,migrateDialingPolicies} from './dialingPolicy.js';
import {expandLocalDestination} from './localDialing.js';
const id='00000000-0000-4000-8000-000000000001',user={id,tenant_id:'t',role:'super_admin'};
async function handle(pool,{method='GET',path='/api/admin/dialing-policy',body={},actor=user}={}){let reply;await handleDialingPolicy({req:{method},res:{},path,user:actor,pool,readJson:async()=>body,send:(_,status,data)=>{reply={status,data};}});return reply;}
test('strict controls, inherited defaults and tenant-scoped user overrides',async()=>{
 assert.throws(()=>validateDialingSettings({...dialingDefaults,extra:true}));assert.throws(()=>validateDialingSettings({...dialingDefaults,prefixSeven:'true'}));
 const pool={query:async(sql,args)=>{assert.match(sql,/tenant_id=\$1/);assert.deepEqual(args,['t',id]);return {rows:[{scope_key:'default',settings:{...dialingDefaults,prefixTen:false},revision:2}]};}};
 const result=await readDialingPolicy(pool,'t',id);assert.equal(result.inherited,true);assert.equal(result.settings.prefixTen,false);
 assert.equal((await readDialingPolicy({query:async()=>({rows:[]})},'t',id)).settings.prefixSeven,true);
 const custom=await readDialingPolicy({query:async()=>({rows:[{scope_key:'default',settings:dialingDefaults,revision:2},{scope_key:id,settings:{...dialingDefaults,prefixSeven:false},revision:3}]})},'t',id);assert.equal(custom.revision,3);assert.equal(custom.inherited,false);assert.equal(custom.settings.prefixSeven,false);
});
test('every toggle controls its normalization behavior',()=>{
 const expand=(n,off)=>expandLocalDestination(n,'US','+13105550123',{...dialingDefaults,[off]:false});
 assert.equal(expand('9515282','prefixSeven'),'9515282');assert.equal(expand('3109515282','prefixTen'),'3109515282');assert.equal(expand('123456789','prefixOther'),'123456789');assert.equal(expand('0112348031234567','stripIdd'),'0112348031234567');
 assert.equal(expandLocalDestination('08031234567','NG','',{...dialingDefaults,stripTrunk:false}),'23408031234567');
});
test('API enforces super-admin and tenant user scope before database mutations',async()=>{
 assert.equal((await handle({}, {actor:{...user,role:'user'}})).status,403);
 assert.equal((await handle({query:async()=>({rows:[]})},{path:'/api/admin/dialing-policy/users/'+id})).status,404);
});
test('saving writes policy and before/after audit in one transaction; stale revision rolls back',async()=>{
 const log=[];const db={query:async(sql,args)=>{log.push({sql,args});return {rows:sql.includes('SELECT settings')?[{settings:dialingDefaults,revision:2}]:[]};},release(){}};
 const pool={connect:async()=>db};
 assert.equal((await handle(pool,{method:'PUT',body:{revision:1,settings:dialingDefaults}})).status,409);assert.equal(log.at(-1).sql,'ROLLBACK');assert.equal(log.some(x=>x.sql.startsWith('INSERT')),false);
 log.length=0;assert.equal((await handle(pool,{method:'PUT',body:{revision:2,settings:{...dialingDefaults,prefixTen:false}}})).status,200);
 assert.equal(log.at(-1).sql,'COMMIT');const audit=log.find(x=>x.sql.includes('INSERT INTO dialing_policy_events'));assert.equal(JSON.parse(audit.args[5]).prefixTen,true);assert.equal(JSON.parse(audit.args[6]).prefixTen,false);
});
test('preview uses selected tenant user profile and never places a call',async()=>{
 const sqls=[];const pool={query:async(sql)=>{sqls.push(sql);return {rows:sql.includes('LEFT JOIN user_profiles')?[{country:'US',phone_e164:'+13105550123'}]:[]};}};
 const result=await handle(pool,{method:'POST',path:'/api/admin/dialing-policy/preview',body:{userId:id,number:'9515282'}});
 assert.equal(result.data.number,'13109515282');assert.equal(result.data.previewOnly,true);assert.equal(sqls.some(s=>/INSERT|UPDATE/.test(s)),false);
});
test('migrations create both durable policy and audit tables',async()=>{const sql=[];await migrateDialingPolicies({query:async s=>sql.push(s)});assert.equal(sql.length,2);assert.match(sql[0],/PRIMARY KEY\(tenant_id,scope_key\)/);assert.match(sql[1],/before_settings JSON/);});
