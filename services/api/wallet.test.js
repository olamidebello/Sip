import test from "node:test";
import assert from "node:assert/strict";
import {validateTransfer,handleWallet} from "./wallet.js";

const sender="00000000-0000-4000-8000-000000000001";
const recipient="00000000-0000-4000-8000-000000000002";
const key="00000000-0000-4000-8000-000000000003";
test("transfer input requires positive integer cents and a stable request ID",()=>{
  assert.throws(()=>validateTransfer({recipientEmail:"b@example.com",amountCents:1.5,idempotencyKey:key}));
  assert.throws(()=>validateTransfer({recipientEmail:"b@example.com",amountCents:0,idempotencyKey:key}));
  assert.equal(validateTransfer({recipientEmail:" B@EXAMPLE.COM ",amountCents:100,idempotencyKey:key}).email,"b@example.com");
});
test("unfunded transfer rolls back without inserting a transfer",async()=>{
  const statements=[];
  const db={query:async(sql,params)=>{
    statements.push({sql,params});
    if(sql.startsWith("SELECT balance_cents")) return {rows:[{balance_cents:0}],rowCount:1};
    return {rows:[],rowCount:0};
  },release(){}};
  const result=await handleWallet({req:{method:"POST"},res:{},path:"/api/wallet/transfers",
    user:{id:sender,tenant_id:"tenant-a",features:{billing:true}},
    pool:{query:async()=>({rows:[{id:recipient}],rowCount:1}),connect:async()=>db},
    readJson:async()=>({recipientEmail:"b@example.com",amountCents:100,idempotencyKey:key}),
    send:(_res,status,body)=>({status,body})});
  assert.equal(result.status,409);
  assert.equal(statements.some(({sql})=>sql.startsWith("INSERT INTO wallet_transfers")),false);
  assert.equal(statements.at(-1).sql,"ROLLBACK");
  assert.equal(statements.filter(({sql})=>sql.startsWith("SELECT balance_cents")).length,2);
});
