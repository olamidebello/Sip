import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAttachment,handleMessengerFeatures} from './messengerFeatures.js';
const id='11111111-1111-4111-8111-111111111111',group='22222222-2222-4222-8222-222222222222';
async function invoke({path='/api/messenger/groups',method='GET',body={},rows=()=>[],features={messaging:true}}={}){
 const statements=[];const db={query:async(sql,params)=>{statements.push({sql,params});const result=rows(sql);return {rows:result,rowCount:result.length};},release(){}};
 let response;await handleMessengerFeatures({req:{method},res:{},path,user:{id,tenant_id:'tenant-a',features},pool:{...db,connect:async()=>db},readJson:async()=>body,url:new URL('https://app.test'+path),send:(_,status,body)=>response={status,body},sessionHash:'a'.repeat(64)});return {...response,statements};
}
test('attachment validation rejects executable content, mismatched signatures and oversized files',()=>{
 const png={name:'photo.png',mime:'image/png',data:Buffer.from('89504e470d0a1a0a0000','hex').toString('base64')};assert.equal(validateAttachment(png).mime,'image/png');
 assert.throws(()=>validateAttachment({...png,data:Buffer.from('<svg onload="alert(1)">').toString('base64')}));
 assert.throws(()=>validateAttachment({...png,mime:'text/html'}));assert.throws(()=>validateAttachment({...png,data:'%%%'}));
 assert.throws(()=>validateAttachment({...png,data:Buffer.alloc(2097153).toString('base64')}));
});
test('group listing is tenant and membership scoped; unavailable members cannot post',async()=>{
 const list=await invoke();assert.equal(list.status,200);assert.deepEqual(list.statements[0].params,[id,'tenant-a']);assert.match(list.statements[0].sql,/m.user_id=\$1 AND g.tenant_id=\$2/);
 const denied=await invoke({path:'/api/messenger/groups/'+group+'/messages',method:'POST',body:{body:'hello'}});assert.equal(denied.status,404);assert.equal(denied.statements.some(s=>s.sql.startsWith('INSERT INTO messenger_group_messages')),false);
});
test('community announcements reject non-owner posting and keep database unchanged',async()=>{
 const response=await invoke({path:'/api/messenger/groups/'+group+'/messages',method:'POST',body:{body:'hello'},rows:sql=>sql.startsWith('SELECT g.*')?[{owner_id:group,kind:'community'}]:[]});assert.equal(response.status,403);assert.equal(response.statements.some(s=>s.sql.startsWith('INSERT INTO')),false);
});
test('broadcasts validate recipients before writing; stars require message participation',async()=>{
 const broadcast=await invoke({path:'/api/messenger/broadcast',method:'POST',body:{recipients:[group,group],body:'hello'}});assert.equal(broadcast.status,400);assert.equal(broadcast.statements.length,0);
 const starred=await invoke({path:'/api/messenger/messages/'+group+'/star',method:'PUT',body:{starred:true}});assert.equal(starred.status,404);assert.equal(starred.statements.some(s=>s.sql.startsWith('INSERT')),false);
});
test('statuses enforce expiry and mutual-contact privacy; session listing ignores messaging permission',async()=>{
 const status=await invoke({path:'/api/messenger/status'});assert.equal(status.status,200);assert.match(status.statements[0].sql,/expires_at>UTC_TIMESTAMP/);assert.match(status.statements[0].sql,/owner_id=\$1 AND contact_id=st.owner_id/);
 const sessions=await invoke({path:'/api/account/sessions',features:{messaging:false}});assert.equal(sessions.status,200);assert.equal(sessions.statements[0].params[0],id);
 const deletion=await invoke({path:'/api/account/sessions/'+'b'.repeat(64),method:'DELETE',features:{messaging:false}});assert.deepEqual(deletion.statements[0].params,[id,'b'.repeat(64)]);
});
