import test from "node:test";
import assert from "node:assert/strict";
import { validInhouseDid,nigeriaBlockNumber } from "./dids.js";

test("in-house import rejects invalid North American exchanges",() => {
  assert.equal(validInhouseDid("+12031500000"),false);
  assert.equal(validInhouseDid("+12031549999"),false);
  assert.equal(validInhouseDid("+12032501234"),true);
  assert.equal(validInhouseDid("+2348012345678"),true);
  assert.equal(validInhouseDid("2031500000"),false);
  assert.equal(validInhouseDid("+2342031500000"),true);
  assert.equal(validInhouseDid("+2342031549999"),true);
  assert.equal(nigeriaBlockNumber("203150",0),"+2342031500000");
  assert.equal(nigeriaBlockNumber("203154",9999),"+2342031549999");
  assert.equal(nigeriaBlockNumber("203155",0),null);
});
