import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserPushClient} from './browserPushClient.js';
function fixture(permission='default') {
 const requests=[],elements=[];let permissionRequests=0;
 const subscription={toJSON:()=>({endpoint:'https://fcm.googleapis.com/x',keys:{}})};
 const button={};
 const window={isSecureContext:true,PushManager:{},Notification:{permission,requestPermission:async()=>{permissionRequests++;return 'granted';}},navigator:{serviceWorker:{register:async()=>({pushManager:{getSubscription:async()=>subscription}}),ready:Promise.resolve()}},atob:globalThis.atob};
 const document={createElement:()=>button,querySelector:()=>({insertAdjacentElement:(_where,element)=>elements.push(element)})};
 const request=async(path,body,method)=>{requests.push({path,body,method});return {configured:true,publicKey:'public'};};
 const client=createBrowserPushClient({request,onStatus:()=>{},window,document});
 return {client,button,requests,elements,permissionRequests:()=>permissionRequests};
}
test('permission is requested only after explicit button click',async()=>{
 const f=fixture();await f.client.start();assert.equal(f.permissionRequests(),0);assert.equal(f.requests.length,0);
 f.button.onclick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.permissionRequests(),1);assert.equal(f.requests.at(-1).path,'/api/native-push/web-device');
});
test('previously granted subscription is registered without another prompt',async()=>{
 const f=fixture('granted');await f.client.start();assert.equal(f.permissionRequests(),0);assert.equal(f.button.disabled,true);
 await f.client.stop();assert.equal(f.button.hidden,true);
});
test('unsupported browser is a harmless no-op',async()=>{
 const client=createBrowserPushClient({window:{},document:{},request:()=>{throw Error('unexpected');},onStatus:()=>{}});
 await client.start();await client.stop();
});
