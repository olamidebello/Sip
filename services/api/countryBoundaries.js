/** Country geofence verification boundary adapter.
 * Until a vetted polygon dataset is provisioned, never claim that a point
 * belongs to a country based on its dial code or a bounding rectangle.
 * The caller must fail closed for location-restricted routing.
 */
export function countryVerdict(countryCodes, position) {
  if (!Array.isArray(countryCodes) || !position ||
      !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) {
    return {allowed:false, reason:'Verified country boundary unavailable'};
  }
  return {allowed:false, reason:'Verified country boundary unavailable'};
}
