import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTrunk,publicTrunk,adapterTrunk,acknowledgedTrunk,saveFlowrouteTrunk} from './flowrouteTrunk.js';
const config={expectedRevision:0,authenticationMode:'ip',pop:'US-East-VA',sipUsername:'12345678',sipPassword:'private-password',techPrefix:'12345678',publicIp:'154.29.77.102',allowedIpConfirmed:true,callerId:'+12125550123',maxConcurrentCalls:500};
test('IP routing sends tech prefix but never SIP password to the switch',()=>{
 const c=validateTrunk(config);const payload=adapterTrunk({...c,revision:2});assert.equal(payload.register,false);assert.equal(payload.destinationFormat,'techPrefix*E164');assert.equal(payload.defaultOutbound,'flowroute');assert.equal('sipPassword' in payload,false);assert.equal('sipPassword' in publicTrunk(c),false);
 assert.equal(acknowledgedTrunk({configurationRevision:2,authenticationMode:'ip',defaultOutbound:'flowroute'},payload),true);
 assert.equal(acknowledgedTrunk({configurationRevision:1,authenticationMode:'ip',defaultOutbound:'flowroute'},payload),false);
});
test('IP allowlist confirmation and caller ID are required before commissioning',()=>{
 assert.throws(()=>adapterTrunk({...config,allowedIpConfirmed:false}),/allowed/);assert.throws(()=>adapterTrunk({...config,callerId:''}),/caller ID/);
 assert.throws(()=>validateTrunk({...config,pop:'untrusted.example'}));assert.throws(()=>validateTrunk({...config,sipUsername:'bad\r\nVia:'}));
});
test('digest mode sends credentials without registration and blank rotation retains existing secret',()=>{
 const c=validateTrunk({...config,authenticationMode:'digest',sipPassword:''},{sipPassword:'existing'});assert.equal(adapterTrunk(c).sipPassword,'existing');assert.equal(adapterTrunk(c).destinationFormat,'E164');
});
test('trunk save rejects stale revisions and does not overwrite ciphertext',async()=>{
 const prior=process.env.PROVIDER_CREDENTIAL_KEY;process.env.PROVIDER_CREDENTIAL_KEY='a'.repeat(64);let wrote=false;
 const db={query:async(sql)=>{if(sql.includes('GET_LOCK'))return {rows:[{acquired:1}],rowCount:1};if(sql.startsWith('SELECT revision'))return {rows:[{revision:4}],rowCount:1};if(sql.startsWith('INSERT'))wrote=true;return {rows:[],rowCount:0};},release(){}};
 const pool={query:async()=>({rows:[],rowCount:0}),connect:async()=>db};
 try{const r=await saveFlowrouteTrunk(pool,{id:'admin',tenant_id:'tenant'},config);assert.equal(r.code,409);assert.equal(wrote,false);}finally{if(prior===undefined)delete process.env.PROVIDER_CREDENTIAL_KEY;else process.env.PROVIDER_CREDENTIAL_KEY=prior;}
});

test('saving a trunk encrypts the password and GET exposes only safe metadata',async()=>{
 const prior=process.env.PROVIDER_CREDENTIAL_KEY;process.env.PROVIDER_CREDENTIAL_KEY='a'.repeat(64);let cipher;
 const db={query:async(sql,args)=>{if(sql.includes('GET_LOCK'))return {rows:[{acquired:1}],rowCount:1};if(sql.startsWith('INSERT INTO provider_api_credentials'))cipher=args[2];return {rows:[],rowCount:0};},release(){}};
 const pool={connect:async()=>db,query:async sql=>sql.startsWith('SELECT revision')?{rows:[{revision:1}],rowCount:1}:cipher?{rows:[{enabled:1,ciphertext:cipher}],rowCount:1}:{rows:[],rowCount:0}};
 try{const r=await saveFlowrouteTrunk(pool,{id:'admin',tenant_id:'tenant'},config);assert.equal(r.code,200);assert.equal(cipher.includes(Buffer.from(config.sipPassword)),false);assert.equal(JSON.stringify(r.body).includes(config.sipPassword),false);assert.equal(r.body.passwordConfigured,true);}finally{if(prior===undefined)delete process.env.PROVIDER_CREDENTIAL_KEY;else process.env.PROVIDER_CREDENTIAL_KEY=prior;}
});
