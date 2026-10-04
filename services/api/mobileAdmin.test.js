import test from "node:test";
import assert from "node:assert/strict";
import { validateApp, validateRelease } from "./mobileAdmin.js";
const valid = { versionName:"1.2.3",buildNumber:"42",track:"internal",rolloutPercent:10,
  releaseNotes:"Preview",artifactUrl:"https://example.com/release.aab",artifactSha256:"a".repeat(64) };
test("platform track and artifact references are validated", () => {
  assert.equal(validateApp({ platform:"android",appIdentifier:"com.example.app",displayName:"App" }).platform,"android");
  assert.equal(validateRelease(valid,"android").track,"internal");
  assert.throws(() => validateRelease({ ...valid,track:"testflight" },"android"));
  assert.throws(() => validateRelease({ ...valid,artifactUrl:"https://example.com/file?token=secret" },"android"));
  assert.throws(() => validateRelease({ ...valid,rolloutPercent:0 },"android"));
});
