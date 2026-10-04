import test from "node:test";
import assert from "node:assert/strict";
import { escapeLdapFilter,loadLdapConnections,authenticateDirectory,loginWithLdap,handleLdapAdmin } from "./ldap.js";

const tenant="00000000-0000-4000-8000-000000000000";
const groupId="00000000-0000-4000-8000-000000000001";
const config={url:"ldaps://directory.example.org:636",baseDn:"dc=example,dc=org",
  bindDn:"cn=search,dc=example,dc=org",bindPassword:"private-test-only"};

test("LDAP filter input is escaped and only secure URLs are configured",()=>{
  assert.equal(escapeLdapFilter("a*)(mail=*)\\\0"),"a\\2a\\29\\28mail=\\2a\\29\\5c\\00");
  assert.deepEqual(loadLdapConnections(JSON.stringify({[tenant]:config}))[tenant],config);
  assert.throws(()=>loadLdapConnections(JSON.stringify({[tenant]:{...config,url:"ldap://directory.example.org"}})));
});

test("directory bind searches uniquely then verifies the user's password",async()=>{
  const calls=[];
  class FakeClient {
    constructor(options) {assert.match(options.url,/^ldaps:/);assert.equal(options.tlsOptions.minVersion,"TLSv1.2");}
    async bind(dn,password) {calls.push([dn,password]);}
    async search(base,options) {
      assert.equal(base,config.baseDn);assert.equal(options.filter,"(mail=person@example.org)");
      return {searchEntries:[{dn:"uid=person,dc=example,dc=org",mail:"person@example.org",
        memberOf:["CN=Agents,DC=example,DC=org"],cn:"Person"}]};
    }
    async unbind() {calls.push(["unbind"]);}
  }
  const identity=await authenticateDirectory({config,email:"person@example.org",password:"correct",
    clientFactory:FakeClient});
  assert.deepEqual(identity.groups,["cn=agents,dc=example,dc=org"]);
  assert.deepEqual(calls.slice(0,2),[[config.bindDn,config.bindPassword],[identity.dn,"correct"]]);
});

test("unmapped LDAP users cannot obtain an account session",async()=>{
  const pool={query:async(sql)=>sql.includes("FROM tenants")?{rows:[{id:tenant}]}:{rows:[]},
    connect:async()=>{throw new Error("unmapped user must not be created");}};
  const user=await loginWithLdap({pool,connections:{[tenant]:config},slug:"olamide",email:"person@example.org",password:"correct",
    authenticate:async()=>({dn:"uid=person,dc=example,dc=org",email:"person@example.org",name:"Person",groups:["cn=other,dc=example,dc=org"]})});
  assert.equal(user,null);
});

test("LDAP credentials cannot silently take over a local-password account",async()=>{
  const calls=[];
  const db={query:async(sql)=>{
    calls.push(sql);
    if(sql.includes("FROM users WHERE email"))return {rows:[{id:"local-id",tenant_id:tenant,auth_source:"local",status:"active"}]};
    return {rows:[]};
  },release(){}};
  const pool={query:async(sql)=>sql.includes("FROM tenants")?{rows:[{id:tenant}]}:
    {rows:[{group_dn:"cn=agents,dc=example,dc=org",group_id:groupId}]},connect:async()=>db};
  const user=await loginWithLdap({pool,connections:{[tenant]:config},slug:"olamide",email:"person@example.org",password:"correct",
    authenticate:async()=>({dn:"uid=person,dc=example,dc=org",email:"person@example.org",name:"Person",groups:["cn=agents,dc=example,dc=org"]})});
  assert.equal(user,null);
  assert.ok(calls.includes("ROLLBACK"));
  assert.ok(!calls.some(sql=>sql.startsWith("UPDATE users") || sql.startsWith("DELETE FROM user_group_members")));
});

test("tenant admin cannot map another tenant's app group",async()=>{
  const pool={query:async(sql,params)=>{assert.equal(params[1],tenant);return {rows:[],rowCount:0};}};
  const response=await handleLdapAdmin({req:{method:"POST"},res:{},path:"/api/admin/ldap/mappings",
    user:{id:"actor",tenant_id:tenant,role:"admin"},pool,send:(_res,status,body)=>({status,body}),
    readJson:async()=>({groupDn:"cn=agents,dc=example,dc=org",groupId}),connections:{[tenant]:config}});
  assert.equal(response.status,404);
});
