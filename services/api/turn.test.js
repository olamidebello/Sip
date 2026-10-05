import test from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {turnIceServer} from "./turn.js";

test("TURN credentials use coturn time-limited REST HMAC format",()=>{
  const secret="s".repeat(40),userId="00000000-0000-4000-8000-000000000001";
  const result=turnIceServer({secret,host:"sip.dobhrap.com",userId,now:0});
  assert.equal(result.username,`3600:${userId}`);
  assert.equal(result.credential,createHmac("sha1",secret).update(result.username).digest("base64"));
  assert.deepEqual(result.urls,["turn:sip.dobhrap.com:3478?transport=udp","turn:sip.dobhrap.com:3478?transport=tcp"]);
});
test("TURN config rejects missing secret and unsafe host",()=>{
  assert.throws(()=>turnIceServer({secret:"short",host:"sip.dobhrap.com",userId:"00000000-0000-4000-8000-000000000001"}));
  assert.throws(()=>turnIceServer({secret:"s".repeat(40),host:"evil.com/path",userId:"00000000-0000-4000-8000-000000000001"}));
});
