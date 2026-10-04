import test from "node:test";
import assert from "node:assert/strict";
import { validateNigeriaPeer } from "./nigeria.js";

test("Nigeria peer plans require an agreement and +234 route prefix",() => {
  const peer={name:"Test clearinghouse",peerType:"clearinghouse",host:"peer.example",
    port:5061,transport:"tls",destinationPrefix:"234",agreementReference:"test agreement"};
  assert.equal(validateNigeriaPeer(peer),peer);
  assert.throws(()=>validateNigeriaPeer({...peer,destinationPrefix:"1"}));
  assert.throws(()=>validateNigeriaPeer({...peer,agreementReference:""}));
});
