import test from "node:test";
import assert from "node:assert/strict";
import {cleanSearch,handleSupport} from "./support.js";
import {handleSearch} from "./search.js";

const user={id:"a",tenant_id:"tenant-a",role:"user",features:{messaging:true,billing:true}};
const call=async(path,method,pool,body)=>{
  let result;
  await handleSupport({req:{url:path,method},res:{},path:path.split("?")[0],user,pool,
    readJson:async()=>body,send:(_res,status,value)=>{result={status,value};}});
  return result;
};
test("search escapes literal wildcard characters and bounds length",()=>{
  assert.equal(cleanSearch(" 50%_! "),"%50!%!_!!%");
  assert.throws(()=>cleanSearch("a"));
});
test("ticket detail hides other tenant and other user tickets",async()=>{
  const id="00000000-0000-4000-8000-000000000001";
  const pool={query:async()=>({rows:[{id,requester_id:"someone-else"}]})};
  const result=await call(`/api/support/tickets/${id}`,"GET",pool);
  assert.equal(result.status,404);
});
test("non-admin ticket list is restricted to own tenant and requester",async()=>{
  let params,sql;
  const pool={query:async(statement,values)=>{sql=statement;params=values;return {rows:[]};}};
  const result=await call("/api/support/tickets?q=hello&status=open&page=2","GET",pool);
  assert.equal(result.status,200);assert.match(sql,/requester_id=/);
  assert.equal(params[0],user.tenant_id);assert.equal(params[1],user.id);
});
test("global search uses tenant and own contact filters",async()=>{
  const calls=[],pool={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}};
  let response;
  await handleSearch({req:{url:"/api/search?q=help",method:"GET"},res:{},user,pool,
    send:(_res,_status,value)=>{response=value;}});
  assert.equal(calls.length,3);
  assert(calls.every(call=>call.params[0]===user.tenant_id || call.params[0]===user.id));
  assert.match(calls[0].sql,/requester_id=/);
  assert.equal(response.results.tickets.length,0);
});
