import test from "node:test";
import assert from "node:assert/strict";
import { handleAccess } from "./access.js";

const user={id:"00000000-0000-4000-8000-000000000001",role:"admin",tenant_id:"tenant-a"};
const target="00000000-0000-4000-8000-000000000002";
const request=(action)=>({req:{method:"POST"},res:{},path:`/api/admin/users/${target}/security`,user,
  readJson:async()=>({action}),sessionHash:"session",meetingSignaling:{closeUser(){}},
  send:(_res,status,body)=>({status,body})});

test("security mutations cannot target users in another tenant",async()=>{
  const queries=[];
  const db={query:async(sql,params=[])=>{queries.push({sql,params});return {rows:[],rowCount:0};},release(){}};
  const pool={connect:async()=>db};
  const result=await handleAccess({...request("suspend"),pool});
  assert.equal(result.status,404);
  assert.ok(queries.some(({sql,params})=>sql.includes("FROM users WHERE id=$1 AND tenant_id=$2") && params[1]==="tenant-a"));
  assert.ok(!queries.some(({sql})=>sql.startsWith("UPDATE users")));
});

test("last active tenant administrator cannot be suspended",async()=>{
  const queries=[];
  const db={query:async(sql,params=[])=>{
    queries.push(sql);
    if(sql.includes("SELECT id,role,status FROM users"))return {rows:[{id:target,role:"admin",status:"active"}],rowCount:1};
    if(sql.includes("COUNT(*) AS total"))return {rows:[{total:1}],rowCount:1};
    return {rows:[],rowCount:0};
  },release(){}};
  const result=await handleAccess({...request("suspend"),user:{...user,role:"super_admin"},pool:{connect:async()=>db}});
  assert.equal(result.status,409);
  assert.ok(queries.includes("ROLLBACK"));
  assert.ok(!queries.some(sql=>sql.startsWith("UPDATE users")));
});

test("ordinary users cannot read security events",async()=>{
  const result=await handleAccess({req:{method:"GET"},res:{},path:"/api/admin/security/events",
    user:{role:"user",tenant_id:"tenant-a"},pool:{},send:(_res,status,body)=>({status,body})});
  assert.equal(result.status,403);
});

test('tenant administrator cannot change another administrator',async()=>{
  const db={query:async(sql)=> sql.includes('SELECT id,role,status FROM users')
    ? {rows:[{id:target,role:'admin',status:'active'}],rowCount:1}
    : {rows:[],rowCount:0},release(){}};
  const result=await handleAccess({...request('demote'),pool:{connect:async()=>db}});
  assert.equal(result.status,403);
});
