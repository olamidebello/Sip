import test from 'node:test';
import assert from 'node:assert/strict';
import {validateScheduledCall} from './scheduledCalls.js';
test('scheduled calls require a SIP address and a bounded future date',()=>{
 const now=Date.parse('2026-10-13T00:00:00Z'),value={title:'Call Alex',address:'sip:alex@example.com',startsAt:'2026-10-14T00:00:00Z'};
 assert.equal(validateScheduledCall(value,now).title,'Call Alex');
 for(const change of [{title:''},{address:'https://example.com'},{startsAt:'invalid'},{startsAt:'2026-10-12T00:00:00Z'},{startsAt:'2030-10-14T00:00:00Z'}])assert.throws(()=>validateScheduledCall({...value,...change},now));
});
