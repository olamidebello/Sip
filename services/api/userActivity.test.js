import test from 'node:test';
import assert from 'node:assert/strict';
import {handleUserActivity,recordApiActivity} from './userActivity.js';
const user={id:'user-a',tenant_id:'tenant-a',role:'user'};
const send=(_res,status,body)=>({status,body});
const invoke=(extra={})=>handleUserActivity({req:{method:'GET'},path:'/api/activity/events',user,send,url:new URL('https://example.com'),...extra});
test('personal activity is scoped by authenticated tenant and user',async()=>{
  let query;const result=await invoke({pool:{query:async(sql,args)=>{query={sql,args};return {rows:[]};}}});
  assert.equal(result.status,200);assert.deepEqual(query.args,['tenant-a','user-a',50]);assert.match(query.sql,/user_id=\$2/);
});
test('regular users cannot access tenant activity',async()=>{
  const result=await invoke({path:'/api/admin/activity/events'});assert.equal(result.status,403);
});
test('admin activity cannot switch tenant through query string',async()=>{
  let args;const result=await invoke({path:'/api/admin/activity/events',user:{...user,role:'admin'},url:new URL('https://example.com?tenant=tenant-b'),pool:{query:async(_sql,a)=>{args=a;return {rows:[]};}}});
  assert.equal(result.status,200);assert.deepEqual(args,['tenant-a',50]);
});
test('browser activity rejects secrets, arbitrary labels and identity overrides',async()=>{
  for(const event of [{type:'navigate',target:'api-key-secret'},{type:'interaction',target:'settings',password:'secret'},{type:'heartbeat',target:'workspace',user_id:'other'}]){
    const result=await invoke({req:{method:'POST'},readJson:async()=>({events:[event]})});assert.equal(result.status,400);
  }
});
test('browser event insertion binds actor identity and enforces database rate limit',async()=>{
  const queries=[];const db={query:async(sql,args)=>{queries.push({sql,args});return {rows:[{count:0}]};},release(){}};
  const result=await invoke({req:{method:'POST'},readJson:async()=>({events:[{type:'navigate',target:'settings'}]}),pool:{connect:async()=>db,query:async()=>({})}});
  assert.equal(result.status,202);const insert=queries.find(q=>q.sql.startsWith('INSERT'));assert.deepEqual(insert.args.slice(1),['tenant-a','user-a','browser','navigate','settings','reported']);
  db.query=async sql=>({rows:[{count:120}]});
  assert.equal((await invoke({req:{method:'POST'},readJson:async()=>({events:[{type:'heartbeat',target:'workspace'}]}),pool:{connect:async()=>db}})).status,429);
});
test('server request events exclude query strings and resource IDs',async()=>{
  let args;await recordApiActivity({query:async(_sql,a)=>{args=a;}},user,'PUT','/api/admin/carriers/1234?apiKey=secret',403);
  assert.equal(args[5],'/api/admin/carriers');assert.equal(args[6],'failed');assert.equal(JSON.stringify(args).includes('secret'),false);
});
