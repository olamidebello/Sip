import test from 'node:test';
import assert from 'node:assert/strict';
import {inviteMeeting} from './meetingInvitations.js';

test('only an active tenant recipient of a hosted room is invited',async()=>{
  const calls=[];const pool={query:async(sql,args)=>{
    calls.push([sql,args]);return sql.includes('SELECT u.id')?
      {rowCount:1,rows:[{id:'recipient'}]}:{rowCount:0,rows:[]};}};
  const result=await inviteMeeting({pool,tenant:'tenant',host:'host',roomId:'room',email:'guest@example.com'});
  assert.equal(result.status,200);assert.equal(calls.length,2);
  assert.match(calls[0][0],/m\.host_id=\$2/);
  assert.deepEqual(calls[1][1],['room','tenant','recipient','host']);
});
test('unknown recipient does not create an invitation',async()=>{
  let writes=0;const pool={query:async()=>{writes++;return {rowCount:0,rows:[]};}};
  const result=await inviteMeeting({pool,tenant:'tenant',host:'host',roomId:'room',email:'missing@example.com'});
  assert.equal(result.status,404);assert.equal(writes,1);
});
