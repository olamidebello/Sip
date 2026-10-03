import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGeofence } from "./geofence.js";

const policy = {
  enabled: true,
  maxAccuracyMeters: 100,
  zones: [{ latitude: 32.7767, longitude: -96.7970, radiusMeters: 5000 }]
};

test("allows accurate reading inside configured area", () => {
  assert.equal(evaluateGeofence(policy, {
    latitude: 32.7767, longitude: -96.7970, accuracy: 20
  }).allowed, true);
});
test("denies outside or uncertain positions", () => {
  assert.equal(evaluateGeofence(policy, {
    latitude: 29.7604, longitude: -95.3698, accuracy: 20
  }).allowed, false);
  assert.equal(evaluateGeofence(policy, {
    latitude: 32.7767, longitude: -96.7970, accuracy: 200
  }).allowed, false);
});
test("fails closed when enabled without zones or valid coordinates", () => {
  assert.equal(evaluateGeofence({ ...policy, zones: [] }, {
    latitude: 0, longitude: 0, accuracy: 1
  }).allowed, false);
  assert.equal(evaluateGeofence(policy, {
    latitude: NaN, longitude: -96.7970, accuracy: 20
  }).allowed, false);
});
