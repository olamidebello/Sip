import test from "node:test";
import assert from "node:assert/strict";
import {validatePreferences,validateCallEvent,handleSoftphoneState} from "./softphoneState.js";

test("softphone settings reject unsafe addresses and deduplicate favorites",()=>{
  assert.deepEqual(validatePreferences({dnd:true,favorites:["sip:a@example.com","sip:a@example.com"]}),
    {dnd:true,favorites:["sip:a@example.com"]});
  assert.throws(()=>validatePreferences({dnd:false,favorites:["javascript:alert(1)"]}));
  assert.throws(()=>validateCallEvent({direction:"outgoing",address:"sip:a@example.com",result:"paid"}));
});
test("history deletion is scoped to user and tenant",async()=>{
  let params;
  const result=await handleSoftphoneState({req:{method:"DELETE"},res:{},path:"/api/softphone/calls",
    user:{id:"u",tenant_id:"t"},pool:{query:async(_sql,values)=>{params=values;return {rows:[]};}},
    send:(_res,status,body)=>({status,body})});
  assert.deepEqual(params,["u","t"]);assert.equal(result.status,200);
});
