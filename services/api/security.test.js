import test from "node:test";
import assert from "node:assert/strict";
import { validateRegistration, hashPassword, verifyPassword, createSessionToken } from "./security.js";

test("normalizes email and rejects weak inputs", () => {
  assert.equal(validateRegistration({
    name: " Olamide ", email: "USER@Example.com ", password: "a secure password"
  }).email, "user@example.com");
  assert.throws(() => validateRegistration({
    name: "O", email: "invalid", password: "short"
  }));
});
test("password is salted, verifiable, and not reusable across hashes", async () => {
  const a = await hashPassword("a secure password");
  const b = await hashPassword("a secure password");
  assert.notEqual(a.hash, b.hash);
  assert.equal(await verifyPassword("a secure password", a.salt, a.hash), true);
  assert.equal(await verifyPassword("wrong password", a.salt, a.hash), false);
  assert.notEqual(createSessionToken(), createSessionToken());
});
