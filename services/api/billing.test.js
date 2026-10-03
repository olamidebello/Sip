import test from "node:test";
import assert from "node:assert/strict";
import { markupCents, parseUsdCents } from "./billing.js";

test("30 percent markup rounds each amount upward to a cent", () => {
  assert.equal(markupCents(125, 3000), 163);
  assert.equal(markupCents(100, 3000), 130);
  assert.equal(markupCents(0, 3000), 0);
  assert.throws(() => markupCents(-1, 3000));
});
test("provider prices parse exactly to integer cents", () => {
  assert.equal(parseUsdCents("3.82"), 382);
  assert.equal(parseUsdCents("0.3"), 30);
  assert.throws(() => parseUsdCents("1.234"));
});
