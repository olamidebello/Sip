import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyCdrSignature, validateCdr, cdrFilters } from "./cdr.js";

const secret = "a".repeat(48);
test("CDR signatures bind the timestamp and raw body and expire",() => {
  const now = Date.now();
  const timestamp = String(Math.floor(now / 1000));
  const body = '{"tenantId":"test"}';
  const signature = createHmac("sha256",secret).update(timestamp+"."+body).digest("hex");
  assert.equal(verifyCdrSignature(secret,timestamp,body,signature,now),true);
  assert.equal(verifyCdrSignature(secret,timestamp,body+" ",signature,now),false);
  assert.equal(verifyCdrSignature(secret,timestamp,body,signature,now+301000),false);
  assert.equal(verifyCdrSignature("",timestamp,body,signature,now),false);
});
test('CDR filters reject unbounded pages and invalid enums',()=>{
  assert.equal(cdrFilters('/api/admin/cdr?page=2&direction=outbound').page,2);
  assert.throws(()=>cdrFilters('/api/admin/cdr?page=0'),RangeError);
  assert.throws(()=>cdrFilters('/api/admin/cdr?source=x%25'),RangeError);
});
test("normalized CDR rejects impossible billable durations",() => {
  const record = {tenantId:"00000000-0000-4000-8000-000000000000",source:"switch-a",
    legId:"leg-1",direction:"outbound",from:"+12125550123",to:"+12125550124",
    disposition:"answered",durationSeconds:60,billableSeconds:55,
    startedAt:new Date().toISOString().replace(/\.\d{3}Z$/,"Z")};
  assert.equal(validateCdr(record),record);
  assert.throws(() => validateCdr({...record,billableSeconds:61}),/Invalid normalized/);
  assert.throws(() => validateCdr({...record,disposition:"missed",billableSeconds:1}),/Invalid normalized/);
});
