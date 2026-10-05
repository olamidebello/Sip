import test from "node:test";
import assert from "node:assert/strict";
import {validateTiles} from "./dashboard.js";

test("dashboard accepts ordered known tiles and rejects duplicates or unknown tiles",()=>{
  assert.deepEqual(validateTiles(["billing","dialer"]),["billing","dialer"]);
  for(const tiles of [[],["dialer","dialer"],["unknown"],"dialer"])
    assert.throws(()=>validateTiles(tiles));
});
