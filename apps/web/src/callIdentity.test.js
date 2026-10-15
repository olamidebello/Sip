import test from 'node:test';
import assert from 'node:assert/strict';
import {callAddressLabel,callIdentityLabel} from './callIdentity.js';
test('identity preserves phone or full registered name while lookups fail or return generic labels',()=>{
 assert.equal(callAddressLabel('sip:+15551234567@example.com'),'+15551234567');
 assert.equal(callIdentityLabel('sip:101@example.com','Registered SIP user'),'101');
 assert.equal(callIdentityLabel('sip:alice@example.com','Unknown caller'),'alice@example.com');
 assert.equal(callIdentityLabel('sip:101@example.com',' Alice Bello '),'Alice Bello');
 assert.equal(callIdentityLabel('+15551234567',''),'+15551234567');
});
