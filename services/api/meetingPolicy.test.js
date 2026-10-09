import test from 'node:test';
import assert from 'node:assert/strict';
import {meetingPolicy,saveMeetingPolicy,validMeetingPolicy} from './meetingPolicy.js';

test('tenant defaults limit rooms to four and permit links and invites',async()=>{
  const policy=await meetingPolicy({query:async()=>({rows:[]})},'tenant');
  assert.equal(policy.maxParticipants,4);assert.equal(policy.allowLinks,true);
  assert.equal(policy.allowInvites,true);
});
test('invalid capacity and contradictory invitation settings cannot be saved',async()=>{
  const base=await meetingPolicy({query:async()=>({rows:[]})},'tenant');
  assert.equal(validMeetingPolicy({...base,maxParticipants:5}),false);
  assert.equal(validMeetingPolicy({...base,allowInvites:false,requireInvitation:true}),false);
  let writes=0;
  await assert.rejects(saveMeetingPolicy({query:async()=>{writes++;}},'tenant','actor',
    {...base,allowInvites:false,requireInvitation:true}),RangeError);
  assert.equal(writes,0);
});
test('saving a policy binds every control to one tenant',async()=>{
  const base=await meetingPolicy({query:async()=>({rows:[]})},'tenant');
  let args;await saveMeetingPolicy({query:async(_sql,values)=>{args=values;}},'tenant','actor',{...base,allowChat:false});
  assert.deepEqual(args,['tenant',4,true,true,false,true,false,true,true,'actor']);
});
