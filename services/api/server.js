import http from "node:http";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  validateRegistration, hashPassword, verifyPassword, createSessionToken, tokenHash
} from "./security.js";

const origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:5173";
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
if (!local && !origin.startsWith("https://"))
  throw new Error("PUBLIC_ORIGIN must use HTTPS outside local development");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const maxBodyBytes = 8192;
const attempts = new Map();

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers
  });
  res.end(JSON.stringify(body));
}
function limit(req) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = attempts.get(key);
  const entry = !record || now - record.start > 60000
    ? { start: now, count: 0 } : record;
  entry.count++;
  attempts.set(key, entry);
  return entry.count <= 20;
}
async function readJson(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new Error("Content-Type must be application/json");
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBodyBytes) throw new Error("Request too large");
  }
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid JSON object");
  return parsed;
}
function sessionCookie(token, maxAge) {
  return `olamide_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${local ? "" : "; Secure"}`;
}
function currentToken(req) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)olamide_session=([^;]+)/);
  return match?.[1];
}
async function handler(req, res) {
  const path = new URL(req.url, origin).pathname;
  if (req.method === "GET" && path === "/api/health")
    return send(res, 200, { status: "ok" });
  if (req.method !== "GET" && req.headers.origin !== origin)
    return send(res, 403, { error: "Invalid origin" });
  if (req.method === "POST" && !limit(req))
    return send(res, 429, { error: "Too many requests" });
  try {
    if (req.method === "POST" && path === "/api/register") {
      const { name, email, password } = validateRegistration(await readJson(req));
      const { salt, hash } = await hashPassword(password);
      const id = randomUUID();
      try {
        await pool.query(
          "INSERT INTO users (id, display_name, email, password_salt, password_hash) VALUES ($1,$2,$3,$4,$5)",
          [id, name, email, salt, hash]
        );
      } catch (error) {
        if (error.code === "23505") return send(res, 409, { error: "Account already exists" });
        throw error;
      }
      return send(res, 201, { id, name, email });
    }
    if (req.method === "POST" && path === "/api/login") {
      const { email, password } = await readJson(req);
      if (typeof email !== "string" || typeof password !== "string" ||
          email.length > 254 || password.length > 1024)
        return send(res, 400, { error: "Invalid credentials" });
      const result = await pool.query(
        "SELECT id, display_name, email, password_salt, password_hash FROM users WHERE email=$1",
        [email.trim().toLowerCase()]
      );
      const user = result.rows[0];
      if (!user || !await verifyPassword(password, user.password_salt, user.password_hash))
        return send(res, 401, { error: "Invalid credentials" });
      const token = createSessionToken();
      await pool.query(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,now() + interval '7 days')",
        [tokenHash(token), user.id]
      );
      return send(res, 200, { id: user.id, name: user.display_name, email: user.email },
        { "Set-Cookie": sessionCookie(token, 604800) });
    }
    if (req.method === "GET" && path === "/api/me") {
      const token = currentToken(req);
      if (!token) return send(res, 401, { error: "Not signed in" });
      const result = await pool.query(
        "SELECT u.id, u.display_name, u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
        [tokenHash(token)]
      );
      const user = result.rows[0];
      return user
        ? send(res, 200, { id: user.id, name: user.display_name, email: user.email })
        : send(res, 401, { error: "Session expired" });
    }
    if (req.method === "POST" && path === "/api/logout") {
      const token = currentToken(req);
      if (token) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
      return send(res, 200, { status: "signed out" },
        { "Set-Cookie": sessionCookie("", 0) });
    }
    return send(res, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof SyntaxError || error.message?.startsWith("Content-Type") ||
        error.message === "Request too large" || error.message === "Invalid JSON object" ||
        error.message?.startsWith("Name must") ||
        error.message?.startsWith("Enter a valid") ||
        error.message?.startsWith("Password must"))
      return send(res, 400, { error: error.message });
    console.error("API request failed", error.code || error.name);
    return send(res, 500, { error: "Internal server error" });
  }
}

await pool.query(await fs.readFile(new URL("./schema.sql", import.meta.url), "utf8"));
const address = process.env.LISTEN_ADDR || "127.0.0.1";
const port = Number(process.env.PORT || 8080);
http.createServer(handler).listen(port, address, () =>
  console.log(`Account API listening on ${address}:${port}`));
