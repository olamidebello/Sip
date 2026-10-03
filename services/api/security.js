import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);

export function validateRegistration(input) {
  const name = String(input.name ?? "").trim();
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  if (name.length < 2 || name.length > 100) throw new Error("Name must be 2–100 characters");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address");
  if (password.length < 12 || password.length > 1024)
    throw new Error("Password must be 12–1024 characters");
  return { name, email, password };
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
