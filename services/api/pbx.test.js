import test from "node:test";
import assert from "node:assert/strict";
import { selectAgents,evaluateOutboundPolicy } from "./pbx.js";
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
test("longest matching outbound policy wins, with default allow",() => {
  const policies=[{prefix:"1",action:"block"},{prefix:"1212",action:"allow"}];
  assert.equal(evaluateOutboundPolicy("+12125550123",policies).allowed,true);
  assert.equal(evaluateOutboundPolicy("+14155550123",policies).allowed,false);
  assert.equal(evaluateOutboundPolicy("+442071234567",policies).allowed,true);
});
