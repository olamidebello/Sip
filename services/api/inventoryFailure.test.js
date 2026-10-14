import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryFailure} from './providers.js';
test('inventory diagnostics classify failures without exposing upstream data',()=>{
  for(const [input,reason] of [[{providerStatus:401},'authentication'],[{providerStatus:403},'authentication'],[{providerStatus:429},'rate_limit'],[{providerStatus:404},'endpoint'],[{name:'TimeoutError'},'timeout'],[{cause:{code:'ENOTFOUND'}},'dns'],[{cause:{code:'CERT_HAS_EXPIRED'}},'tls']]){
    const result=inventoryFailure({...input,message:'secret-token',responseBody:'private'});assert.equal(result.reason,reason);assert.ok(!JSON.stringify(result).includes('secret-token'));assert.ok(!JSON.stringify(result).includes('private'));
  }
});
