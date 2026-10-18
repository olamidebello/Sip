import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWebSubscription,handleWebPushDevice,sendBrowserPush} from './webPush.js';
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/example',keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
test('accept supported push endpoints and strip unrelated properties',()=>{
  assert.deepEqual(validateWebSubscription({...subscription,extra:'unused'}),subscription);
});
test('reject arbitrary URLs, credentials, ports, malformed keys and lookalike hosts',()=>{
  for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.example/a','https://a@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a'])
    assert.throws(()=>validateWebSubscription({...subscription,endpoint}));
  assert.throws(()=>validateWebSubscription({...subscription,keys:{p256dh:'bad',auth:'bad'}}));
});
test('delete is scoped to authenticated owner, not caller supplied identity',async()=>{
  const calls=[];let response;
  await handleWebPushDevice({req:{method:'DELETE'},res:{},path:'/api/native-push/web-device',user:{id:'owner'},pool:{query:async(...args)=>{calls.push(args);}},send:(_r,status,data)=>response={status,data},readJson:async()=>({...subscription,user_id:'other'})});
  assert.equal(response.status,200);
  assert.match(calls[0][0],/user_id=\$2/);assert.equal(calls[0][1][1],'owner');
});
test('delivery encryptor gets short TTL and does not mutate global VAPID settings',async()=>{
  let args;
  await sendBrowserPush(JSON.stringify(subscription),{kind:'incoming_call'}, {config:async()=>({subject:'mailto:admin@example.com',publicKey:'public',privateKey:'private'}),loadSender:async()=>({sendNotification:async(...input)=>{args=input;}})});
  assert.equal(args[2].TTL,45);assert.equal(args[2].urgency,'high');assert.equal(args[2].timeout,8000);
  assert.equal(args[2].vapidDetails.subject,'mailto:admin@example.com');
});
test('expired or removed subscriptions are marked for deletion',async()=>{
  await assert.rejects(sendBrowserPush(JSON.stringify(subscription),{}, {config:async()=>({}),loadSender:async()=>({sendNotification:async()=>{throw Object.assign(Error('gone'),{statusCode:410});}})}),error=>error.unregistered===true);
});
