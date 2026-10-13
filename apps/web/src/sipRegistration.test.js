import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForSipRegistration} from './sipRegistration.js';
test('sending REGISTER does not mark it accepted; only the final success completes registration',async()=>{
 let options,done=false;const pending=waitForSipRegistration({register:async o=>{options=o;}}).then(()=>done=true);await Promise.resolve();assert.equal(done,false);options.requestDelegate.onAccept();await pending;assert.equal(done,true);
});
test('rejection reports the SIP code without response headers or credentials',async()=>{
 const failed=waitForSipRegistration({register:async o=>o.requestDelegate.onReject({message:{statusCode:403,reasonPhrase:'private secret'}})});await assert.rejects(failed,/403.*account denied/);
});
test('no final response times out and transport errors reject',async()=>{
 let expire;const failed=waitForSipRegistration({register:async()=>{}},{setTimer:cb=>{expire=cb;return 1;},clearTimer(){}});expire();await assert.rejects(failed,/timed out/);
 await assert.rejects(waitForSipRegistration({register:async()=>{throw Error('WebSocket closed');}}),/WebSocket closed/);
});
