import test from "node:test";
import assert from "node:assert/strict";
import { defaultTenantId, isAdmin } from "./tenancy.js";
test("only administrator roles receive administrator access", () => {
  assert.match(defaultTenantId,/^[0-9a-f-]{36}$/i);
  assert.equal(isAdmin({role:"user"}),false);
  assert.equal(isAdmin({role:"admin"}),true);
  assert.equal(isAdmin({role:"super_admin"}),true);
});
