import test from "node:test";
import assert from "node:assert/strict";
import { selectAgents } from "./pbx.js";
const agents = [
  {user_id:"a",status:"ready",position:2,changed_at:"2026-01-02T00:00:00Z"},
  {user_id:"b",status:"away",position:1,changed_at:"2026-01-01T00:00:00Z"},
  {user_id:"c",status:"ready",position:3,changed_at:"2026-01-01T00:00:00Z"}
];
test("queue preview excludes unavailable agents and respects strategy",() => {
  assert.deepEqual(selectAgents(agents,"ring_all").map((a) => a.user_id),["a","c"]);
  assert.equal(selectAgents(agents,"ordered")[0].user_id,"a");
  assert.equal(selectAgents(agents,"longest_idle")[0].user_id,"c");
});
