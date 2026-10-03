const earthRadiusMeters = 6371000;
const radians = (degrees) => degrees * Math.PI / 180;

export function distanceMeters(a, b) {
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const deltaLat = radians(b.latitude - a.latitude);
  const deltaLon = radians(b.longitude - a.longitude);
  const h = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function evaluateGeofence(policy, position) {
  if (!policy.enabled) return { allowed: true, reason: "Geofencing disabled" };
  if (!Array.isArray(policy.zones) || policy.zones.length === 0)
    return { allowed: false, reason: "No allowed zones configured" };
  const { latitude, longitude, accuracy } = position;
  if (![latitude, longitude, accuracy].every(Number.isFinite) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0)
    return { allowed: false, reason: "Invalid location reading" };
  if (accuracy > policy.maxAccuracyMeters)
    return { allowed: false, reason: "Location is not accurate enough" };
  const point = { latitude, longitude };
  const allowed = policy.zones.some((zone) => {
    if (!Number.isFinite(zone.latitude) || !Number.isFinite(zone.longitude) ||
        !Number.isFinite(zone.radiusMeters) || zone.radiusMeters <= 0) return false;
    return distanceMeters(point, zone) + accuracy <= zone.radiusMeters;
  });
  return allowed
    ? { allowed: true, reason: "Within an allowed area" }
    : { allowed: false, reason: "Outside the allowed calling area" };
}

export async function checkCurrentLocation(policy, geolocation = navigator.geolocation) {
  if (!policy.enabled) return { allowed: true, reason: "Geofencing disabled" };
  if (!geolocation || !globalThis.isSecureContext)
    return { allowed: false, reason: "Location requires HTTPS and browser support" };
  try {
    const position = await new Promise((resolve, reject) =>
      geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, maximumAge: 0, timeout: 10000
      })
    );
    return evaluateGeofence(policy, position.coords);
  } catch {
    return { allowed: false, reason: "Location permission denied or unavailable" };
  }
}
