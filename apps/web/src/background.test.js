import test from "node:test";
import assert from "node:assert/strict";
import { activePreset } from "./background.js";

test("scheduled background uses local day and night boundaries",()=>{
  const config={dayPreset:"ocean",nightPreset:"midnight",schedule:true};
  assert.equal(activePreset(config,5),"midnight");
  assert.equal(activePreset(config,6),"ocean");
  assert.equal(activePreset(config,17),"ocean");
  assert.equal(activePreset(config,18),"midnight");
  assert.equal(activePreset({...config,schedule:false},23),"ocean");
  assert.equal(activePreset({...config,dayPreset:"url(evil)"},12),"midnight");
});
