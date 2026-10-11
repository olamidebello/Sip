import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {Web} from 'sip.js';
test('keepalive transport retains assigned WebSocket server in SIP.js',async()=>{
 const source=await readFile(new URL('./main.js',import.meta.url),'utf8');
 const expression=source.match(/transportOptions:(\{server,keepAliveInterval:[^}]+\})/);
 assert.ok(expression,'Custom transport must include the assigned server');
 const server='wss://sip.dobhrap.com/ws';
 const transportOptions=vm.runInNewContext('('+expression[1]+')',{server});
 globalThis.window={addEventListener(){}};
 const user=new Web.SimpleUser(server,{aor:'sip:test@sip.dobhrap.com',userAgentOptions:{transportOptions,logBuiltinEnabled:false}});
 assert.equal(user.sessionManager.userAgent.transport.configuration.server,server);
 delete globalThis.window;
});
