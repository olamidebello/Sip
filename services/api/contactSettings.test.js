import test from 'node:test';
import assert from 'node:assert/strict';
import {handleContactSettings} from './contactSettings.js';
const user={id:'owner',tenant_id:'workspace'};
async function invoke(path,method='GET',body={},rows=[]){const queries=[];const db={query:async(sql,params)=>{queries.push({sql,params});return {rows,rowCount:rows.length};},release(){}};let response;await handleContactSettings({path:new URL('https://app.test'+path).pathname,req:{method},user,pool:{...db,connect:async()=>db},readJson:async()=>body,url:new URL('https://app.test'+path),send:(_,status,body)=>{response={status,body};}});return {...response,queries};}
test('directory enforces opt-in, tenant isolation and hides invisible presence',async()=>{
 const r=await invoke('/api/contacts/search?q=Bello');assert.equal(r.status,200);assert.match(r.queries[0].sql,/p.searchable=true/);assert.match(r.queries[0].sql,/p.presence<>'invisible'/);assert.deepEqual(r.queries[0].params,['workspace','owner','bello']);
 assert.equal((await invoke('/api/contacts/search?q=x')).status,400);
});
test('visibility defaults to private and status rejects invalid values',async()=>{
 assert.equal((await invoke('/api/account/contact-settings')).body.searchable,false);
 assert.equal((await invoke('/api/account/contact-settings','PUT',{presence:'bogus'})).status,400);
});
test('forwarding refuses unconsenting destinations',async()=>{
 const r=await invoke('/api/account/contact-settings','PUT',{searchable:true,share_presence:true,accept_forwarded:false,presence:'away',status_text:'Lunch',call_forward:'other',message_forward:null});assert.equal(r.status,400);assert.match(r.queries[0].sql,/p.accept_forwarded=true/);assert.match(r.queries[0].sql,/u.tenant_id=\$3/);
});
test('address book saves under session owner transactionally, and rejects invalid emails',async()=>{
 const r=await invoke('/api/contacts/address-book','POST',{contacts:[{name:'Friend',email:'friend@example.org',phone:''}]});assert.equal(r.status,200);assert.equal(r.queries.find(q=>q.sql.includes('INSERT INTO personal')).params[1],'owner');assert.equal(r.queries.at(-1).sql,'COMMIT');
 assert.equal((await invoke('/api/contacts/address-book','POST',{contacts:[{name:'Friend',email:'bad',phone:''}]})).status,400);
});
test('Google config exposes only a valid public client ID',async()=>{
 const before=process.env.GOOGLE_CONTACTS_CLIENT_ID;
 try{process.env.GOOGLE_CONTACTS_CLIENT_ID='invalid';const args={req:{method:'GET'},path:'/api/contacts/google/config',user:{id:'me',tenant_id:'tenant-a'},pool:{query:async()=>({rows:[]})},send:(_,status,body)=>({status,body})};assert.deepEqual((await handleContactSettings(args)).body,{configured:false,clientId:null});process.env.GOOGLE_CONTACTS_CLIENT_ID='123-public.apps.googleusercontent.com';assert.deepEqual((await handleContactSettings(args)).body,{configured:true,clientId:'123-public.apps.googleusercontent.com'});}finally{if(before===undefined)delete process.env.GOOGLE_CONTACTS_CLIENT_ID;else process.env.GOOGLE_CONTACTS_CLIENT_ID=before;}
});
