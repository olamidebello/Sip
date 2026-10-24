import test from 'node:test';import assert from 'node:assert/strict';
import {validatePhoneSettings,phoneRoutingPolicy,handlePhoneSettings} from './phoneSettings.js';
const user={id:'a'.repeat(36),tenant_id:'tenant'};
const base={dnd:false,callWaiting:true,forwardMode:'off',forwardUser:null,ringSeconds:30,revision:0};
test('reject malformed settings and external forwarding',()=>{for(const b of [{...base,ringSeconds:0},{...base,forwardMode:'always',forwardUser:'+12109050290'},{...base,callWaiting:'true'}])assert.throws(()=>validatePhoneSettings(b));assert.equal(validatePhoneSettings(base).forwardUser,null);});
function pool(profile,dest=[{username:'target',domain:'sip.example',id:'target'}]){return {query:async(sql,args)=>{if(sql.includes('SELECT u.id,u.tenant_id'))return {rows:profile?[profile]:[]};if(sql.includes('SELECT a.username')){assert.equal(args[2],'tenant');return {rows:dest};}if(sql.includes('SELECT dnd'))return {rows:[]};throw Error(sql);}};}
const p={id:'original',tenant_id:'tenant',forward_user:'target',forward_mode:'always',dnd:0};
const lookup={username:'alice',domain:'sip.example',reason:'initial'};
test('DND precedes forwarding',async()=>assert.equal((await phoneRoutingPolicy(pool({...p,dnd:1}),lookup))[1].action,'voicemail'));
test('forward rechecks tenant contact consent and unique SIP destination',async()=>{assert.equal((await phoneRoutingPolicy(pool(p),lookup))[1].username,'target');for(const dest of [[],[{username:'one'},{username:'two'}]])assert.equal((await phoneRoutingPolicy(pool(p,dest),lookup))[1].action,'voicemail');});
test('conditional forwarding only matches requested reason',async()=>{const db=pool({...p,forward_mode:'busy',call_waiting:0,ring_seconds:20});const initial=(await phoneRoutingPolicy(db,lookup))[1];assert.equal(initial.action,'ring');assert.equal(initial.callWaiting,false);assert.equal(initial.ringSeconds,20);assert.equal((await phoneRoutingPolicy(db,{...lookup,reason:'busy'}))[1].action,'forward');});
test('ambiguous or inactive account fails closed',async()=>assert.equal((await phoneRoutingPolicy(pool(null),lookup))[0],404));
test('stale save rolls back without emitting event',async()=>{let rolled=false;const db={query:async sql=>{if(sql==='ROLLBACK')rolled=true;return {rowCount:0};},release(){}};let status;await handlePhoneSettings({req:{method:'PUT'},user,pool:{connect:async()=>db},readJson:async()=>base,send:(r,c)=>status=c});assert.equal(status,409);assert.equal(rolled,true);});
