import test from "node:test";
import assert from "node:assert/strict";
import {validateLocale,handleLocales} from "./locales.js";

test("catalog validates actual language, territory, and currency codes",()=>{
  assert.deepEqual(validateLocale({language:"en",country:"NG",currency:"NGN"}),{language:"en",country:"NG",currency:"NGN"});
  for(const data of [
    {language:"en",country:"ZZ",currency:"USD"},
    {language:"en",country:"US",currency:"FAKE"},
    {language:"invalid",country:"US",currency:"USD"}]) assert.throws(()=>validateLocale(data));
});
test("ordinary users cannot edit tenant defaults",async()=>{
  let status;
  await handleLocales({req:{method:"PUT"},res:{},path:"/api/admin/locales",user:{role:"user"},
    pool:{query:()=>{throw Error("unexpected query");}},send:(_r,code)=>{status=code;}});
  assert.equal(status,403);
});
