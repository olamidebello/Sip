import test from 'node:test';
import assert from 'node:assert/strict';
import {handleBillingControl} from './billingControl.js';

const user={id:'00000000-0000-4000-8000-000000000001',tenant_id:'00000000-0000-4000-8000-000000000002',role:'super_admin'};
test('prepaid policy cannot enable without verified switch enforcement',async()=>{
  const previous=[process.env.LIVE_PREPAID_ENABLED,process.env.LIVE_PREPAID_SWITCH_VERIFIED];
  process.env.LIVE_PREPAID_ENABLED='true';delete process.env.LIVE_PREPAID_SWITCH_VERIFIED;
  try{
    let result;
    await handleBillingControl({req:{method:'PUT'},res:{},user,pool:{connect(){throw Error('unexpected write');}},
      readJson:async()=>({enabled:true,maxCallMinutes:10}),send:(_res,status,body)=>{result={status,body};}});
    assert.equal(result.status,409);
  }finally{
    for(const [key,value] of [['LIVE_PREPAID_ENABLED',previous[0]],['LIVE_PREPAID_SWITCH_VERIFIED',previous[1]]])
      if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
