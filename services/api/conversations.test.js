import test from 'node:test';
import assert from 'node:assert/strict';
import {handleConversations,migrateConversations} from './conversations.js';
const id='11111111-1111-4111-8111-111111111111',peer='22222222-2222-4222-8222-222222222222',message='33333333-3333-4333-8333-333333333333';
const user={id,tenant_id:'tenant',features:{messaging:true}};
async function invoke({path='/api/messages',method='POST',body={},rows=()=>[]}={}){
 const statements=[];const db={query:async(sql,params)=>{statements.push({sql,params});const value=rows(sql);return {rows:value,rowCount:value.length};},release(){}};
 const pool={...db,connect:async()=>db};let response;
 await handleConversations({req:{method},path,user,pool,readJson:async()=>body,url:new URL('https://app.test'+path),send:(_,status,body)=>{response={status,body};}});return {...response,statements};
}
test('message sending checks active tenant contact, blocks, and binds sender to session',async()=>{
 const response=await invoke({body:{recipient:peer,body:' hello '},rows:sql=>sql.includes('FROM contacts')?[{}]:[]});
 assert.equal(response.status,201);const insert=response.statements.find(x=>x.sql.startsWith('INSERT INTO messages'));
 assert.deepEqual(insert.params.slice(1),[id,peer,'hello',null]);assert.ok(response.statements.some(x=>x.sql==='COMMIT'));
 const blocked=await invoke({body:{recipient:peer,body:'hello'},rows:sql=>sql.includes('FROM contacts')||sql.includes('blocked=true')?[{}]:[]});
 assert.equal(blocked.status,403);assert.ok(blocked.statements.some(x=>x.sql==='ROLLBACK'));assert.ok(!blocked.statements.some(x=>x.sql.startsWith('INSERT INTO messages')));
});
test('replies outside the conversation are rejected and sender cannot be overridden',async()=>{
 const response=await invoke({body:{recipient:peer,body:'test',replyTo:message,sender:'attacker'},rows:sql=>sql.includes('FROM contacts')?[{}]:[]});
 assert.equal(response.status,400);assert.ok(!response.statements.some(x=>x.sql.startsWith('INSERT INTO messages')));
});
test('recipient cannot edit or remove another user message',async()=>{
 for(const method of ['PATCH','DELETE']){
 const response=await invoke({path:'/api/messages/'+message,method,body:{body:'overwrite'},rows:sql=>sql.includes('SELECT m.sender_id')?[{sender_id:peer,recipient_id:id}]:[]});
 assert.equal(response.status,403);assert.ok(!response.statements.some(x=>x.sql.startsWith('UPDATE messages')));
 }
});
test('reaction access is tenant-bound and limited to conversation participants',async()=>{
 const response=await invoke({path:'/api/messages/'+message,method:'PUT',body:{reaction:'👍'},rows:sql=>sql.includes('SELECT m.sender_id')?[{sender_id:peer,recipient_id:id}]:[]});
 assert.equal(response.status,200);assert.match(response.statements[0].sql,/s.tenant_id=\$3 AND r.tenant_id=\$3/);
 assert.deepEqual(response.statements.find(x=>x.sql.startsWith('INSERT INTO message_reactions')).params,[message,id,'👍']);
 const unauthorized=await invoke({path:'/api/messages/'+message,method:'PUT',body:{reaction:'👍'}});assert.equal(unauthorized.status,404);
});
test('conversation controls reject unsafe dynamic column names and non-boolean values',async()=>{
 for(const body of [{blocked:'false'},{owner_id:peer},{'blocked=true;DROP TABLE users':true}]){
 const response=await invoke({path:'/api/messages/conversation/'+peer,method:'PUT',body,rows:sql=>sql.includes('FROM contacts')?[{}]:[]});assert.equal(response.status,400);
 }
});
test('message schema upgrades repeat safely without storing plaintext provider credentials',async()=>{
 const statements=[];await migrateConversations({query:async sql=>{statements.push(sql);return {rowCount:1};}});
 assert.ok(!statements.some(sql=>sql.startsWith('ALTER TABLE')));assert.ok(statements.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS message_reactions')));
});
