import test from 'node:test';import assert from 'node:assert/strict';import {handleConversations} from './conversations.js';
test('read all is restricted to authenticated recipient, same tenant, existing contacts and undeleted unread messages',async()=>{
 const result=await handleConversations({req:{method:'POST'},path:'/api/messages/read-all',user:{id:'me',tenant_id:'tenant-a',features:{messaging:true}},pool:{query:async(sql,args)=>{assert.match(sql,/m.recipient_id=\$1/);assert.match(sql,/sender.tenant_id=\$2/);assert.match(sql,/JOIN contacts/);assert.match(sql,/m.read_at IS NULL AND m.deleted_at IS NULL/);assert.deepEqual(args,['me','tenant-a']);return {rowCount:3};}},send:(_,status,body)=>({status,body})});assert.deepEqual(result,{status:200,body:{updated:3}});
});
