import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);

export function validateRegistration(input) {
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  const phone = String(input.phone ?? "").trim();
  const address1 = String(input.address1 ?? "").trim();
  const address2 = String(input.address2 ?? "").trim();
  const city = String(input.city ?? "").trim();
  const region = String(input.region ?? "").trim();
  const postalCode = String(input.postalCode ?? "").trim();
  const country = String(input.country ?? "").trim().toUpperCase();
  if (name.length < 2 || name.length > 100) throw new Error("Name must be 2–100 characters");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address");
  if (password.length < 12 || password.length > 1024)
    throw new Error("Password must be 12–1024 characters");
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Phone must use E.164 format, for example +2348012345678");
  if (!address1 || address1.length > 160 || address2.length > 160 || !city || city.length > 100 ||
      !region || region.length > 100 || !postalCode || postalCode.length > 32 || !/^[A-Z]{2}$/.test(country))
    throw new Error("Enter a complete address and two-letter country code");
  return { name, email, password, phone, address1, address2, city, region, postalCode, country };
}

export async function hashPassword(password) {
  const salt = randomBytes(32).toString("hex");
  const hash = await scrypt(password, Buffer.from(salt, "hex"), 64);
  return { salt, hash: hash.toString("hex") };
}

export async function verifyPassword(password, salt, hash) {
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, Buffer.from(salt, "hex"), 64);
  return timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}
export function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}
