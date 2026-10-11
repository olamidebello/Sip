import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSipProbeAccount} from './sipProbeAccount.js';
test('probe can select active users without an existing or active SIP account',async()=>{
 const old=process.env.SIP_CREDENTIAL_KEY;process.env.SIP_CREDENTIAL_KEY='ab'.repeat(32);
 const pool={query:async(sql,args)=>{assert.match(sql,/LEFT JOIN sip_accounts/);assert.ok(!sql.includes("AND a.status='active'"));assert.deepEqual(args,['test-user']);return {rows:[]};}};
 try{await assert.rejects(prepareSipProbeAccount(pool,'test-user'),/No active user/);}finally{if(old===undefined)delete process.env.SIP_CREDENTIAL_KEY;else process.env.SIP_CREDENTIAL_KEY=old;}
});
test('probe fails before querying when encryption configuration is missing',async()=>{
 const old=process.env.SIP_CREDENTIAL_KEY;delete process.env.SIP_CREDENTIAL_KEY;
 try{await assert.rejects(prepareSipProbeAccount({},''),/not configured/);}finally{if(old!==undefined)process.env.SIP_CREDENTIAL_KEY=old;}
});
