import test from "node:test";
import assert from "node:assert/strict";
import { validateFeatures, effectiveFeatures } from "./permissions.js";

test("group permissions combine without granting absent features", () => {
  const first = validateFeatures({ meetings:true, messaging:true });
  const second = validateFeatures({ remote_assist:true });
  assert.deepEqual(effectiveFeatures([first,second]), {
    meetings:true, screen_share:false, remote_assist:true, messaging:true, billing:false
  });
  assert.equal(effectiveFeatures([],true).screen_share,true);
  assert.throws(() => validateFeatures({ admin:true }));
  assert.throws(() => validateFeatures({ meetings:"yes" }));
});
