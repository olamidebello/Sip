import test from "node:test";
import assert from "node:assert/strict";
import { validInhouseDid } from "./dids.js";

test("in-house import rejects invalid North American exchanges",() => {
  assert.equal(validInhouseDid("+12031500000"),false);
  assert.equal(validInhouseDid("+12031549999"),false);
  assert.equal(validInhouseDid("+12032501234"),true);
  assert.equal(validInhouseDid("+2348012345678"),true);
  assert.equal(validInhouseDid("2031500000"),false);
});
