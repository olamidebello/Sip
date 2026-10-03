export const FEATURE_KEYS = Object.freeze([
  "meetings", "screen_share", "remote_assist", "messaging", "billing"
]);

export function validateFeatures(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((key) => !FEATURE_KEYS.includes(key) || typeof value[key] !== "boolean"))
    throw new Error("Invalid group features");
  return Object.fromEntries(FEATURE_KEYS.map((key) => [key, value[key] === true]));
}

export function effectiveFeatures(groups, admin = false) {
  return Object.fromEntries(FEATURE_KEYS.map((key) =>
    [key, admin || groups.some((group) => group?.[key] === true)]));
}
