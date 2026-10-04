import test from "node:test";
import assert from "node:assert/strict";
import { handleAuthProviders } from "./authProviders.js";
import { defaultTenantId } from "./tenancy.js";

const send=(_res,status,body)=>({status,body});
const path="/api/admin/auth-providers";

test("only a super admin can change provider policy",async()=>{
  const result=await handleAuthProviders({req:{method:"PUT"},res:{},path,
    user:{role:"admin",tenant_id:"tenant-a"},pool:{},send,readJson:async()=>({localEnabled:false,ldapAdminManaged:false}),connections:{}});
  assert.equal(result.status,403);
});

test("default tenant keeps local super-admin recovery",async()=>{
  const result=await handleAuthProviders({req:{method:"PUT"},res:{},path,
    user:{role:"super_admin",tenant_id:defaultTenantId},pool:{},send,
    readJson:async()=>({localEnabled:false,ldapAdminManaged:false}),connections:{}});
  assert.equal(result.status,409);
});

test("local sign-in cannot be disabled without mapped and enabled LDAP",async()=>{
  const pool={query:async(sql,params)=>{
    assert.equal(params[0],"tenant-a");
    return sql.includes("tenant_ldap_settings")?{rows:[{enabled:0}]}:{rows:[{total:0}]};
  }};
  const result=await handleAuthProviders({req:{method:"PUT"},res:{},path,
    user:{role:"super_admin",tenant_id:"tenant-a"},pool,send,
    readJson:async()=>({localEnabled:false,ldapAdminManaged:true}),connections:{"tenant-a":{}}});
  assert.equal(result.status,409);
});
