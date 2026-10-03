import http from "node:http";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { markupCents } from "./billing.js";
import { availableNumbers } from "./providers.js";
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
const uuidPattern = /^[0-9a-f-]{36}$/i;

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
async function currentUser(req) {
  const token = currentToken(req);
  if (!token) return null;
  const result = await pool.query(
    "SELECT u.id, u.display_name, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [tokenHash(token)]
  );
  return result.rows[0] || null;
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
        "SELECT id, display_name, email, role, password_salt, password_hash FROM users WHERE email=$1",
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
      return send(res, 200, { id: user.id, name: user.display_name, email: user.email, role: user.role },
        { "Set-Cookie": sessionCookie(token, 604800) });
    }
    if (req.method === "GET" && path === "/api/me") {
      const user = await currentUser(req);
      return user
        ? send(res, 200, { id: user.id, name: user.display_name, email: user.email, role: user.role })
        : send(res, 401, { error: "Session expired" });
    }
    if (req.method === "POST" && path === "/api/logout") {
      const token = currentToken(req);
      if (token) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash(token)]);
      return send(res, 200, { status: "signed out" },
        { "Set-Cookie": sessionCookie("", 0) });
    }
    if (path === "/api/config" && req.method === "GET") {
      const result = await pool.query("SELECT value FROM app_settings WHERE key='sip_wss_url'");
      return send(res, 200, { sipWssUrl: result.rows[0]?.value || "" });
    }
    if (path === "/api/plans" && req.method === "GET") {
      const result = await pool.query(
        "SELECT id,name,monthly_cents,description FROM plans WHERE active=true ORDER BY monthly_cents,id"
      );
      return send(res, 200, { plans: result.rows });
    }
    if (path.startsWith("/api/contacts") || path.startsWith("/api/messages") ||
        path.startsWith("/api/admin/") || path.startsWith("/api/billing/") ||
        path.startsWith("/api/numbers") || path.startsWith("/api/porting")) {
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: "Sign in required" });
      if (path === "/api/contacts" && req.method === "GET") {
        const result = await pool.query(
          "SELECT u.id, u.display_name AS name, u.email FROM contacts c JOIN users u ON u.id=c.contact_id WHERE c.owner_id=$1 ORDER BY u.display_name LIMIT 200",
          [user.id]
        );
        return send(res, 200, { contacts: result.rows });
      }
      if (path === "/api/contacts" && req.method === "POST") {
        const { email } = await readJson(req);
        if (typeof email !== "string" || email.length > 254)
          return send(res, 400, { error: "Valid contact email required" });
        const found = await pool.query("SELECT id FROM users WHERE email=$1", [email.trim().toLowerCase()]);
        const contact = found.rows[0];
        if (!contact || contact.id === user.id)
          return send(res, 404, { error: "Contact not found" });
        await pool.query(
          "INSERT INTO contacts(owner_id, contact_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [user.id, contact.id]
        );
        return send(res, 201, { id: contact.id });
      }
      if (path === "/api/messages" && req.method === "GET") {
        const contactId = new URL(req.url, origin).searchParams.get("contact");
        if (!/^[0-9a-f-]{36}$/i.test(contactId || ""))
          return send(res, 400, { error: "Contact ID required" });
        const allowed = await pool.query(
          "SELECT 1 FROM contacts WHERE owner_id=$1 AND contact_id=$2", [user.id, contactId]
        );
        if (!allowed.rowCount) return send(res, 403, { error: "Add contact first" });
        const result = await pool.query(
          "SELECT id, sender_id AS sender, recipient_id AS recipient, body, created_at FROM messages WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1) ORDER BY created_at DESC, id DESC LIMIT 100",
          [user.id, contactId]
        );
        return send(res, 200, { messages: result.rows.reverse() });
      }
      if (path === "/api/messages" && req.method === "POST") {
        const { recipient, body } = await readJson(req);
        if (typeof recipient !== "string" || !/^[0-9a-f-]{36}$/i.test(recipient) ||
            typeof body !== "string" || body.trim().length < 1 || body.length > 4000)
          return send(res, 400, { error: "Valid recipient and message required (max 4000 characters)" });
        const allowed = await pool.query(
          "SELECT 1 FROM contacts WHERE owner_id=$1 AND contact_id=$2", [user.id, recipient]
        );
        if (!allowed.rowCount) return send(res, 403, { error: "Add contact first" });
        const result = await pool.query(
          "INSERT INTO messages(id,sender_id,recipient_id,body) VALUES($1,$2,$3,$4) RETURNING id,created_at",
          [randomUUID(), user.id, recipient, body.trim()]
        );
        return send(res, 201, { ...result.rows[0] });
      }
      if (path === "/api/billing/invoices" && req.method === "GET") {
        const result = await pool.query(
          "SELECT id,description,amount_cents,currency,status,created_at FROM invoices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
          [user.id]
        );
        return send(res, 200, { invoices: result.rows });
      }
      if (path === "/api/billing/subscription" && req.method === "GET") {
        const result = await pool.query(
          "SELECT s.plan_id,s.status,p.name,p.monthly_cents FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=$1",
          [user.id]
        );
        return send(res, 200, { subscription: result.rows[0] || null });
      }
      if (path === "/api/billing/select-plan" && req.method === "POST") {
        const { planId } = await readJson(req);
        if (typeof planId !== "string" || !uuidPattern.test(planId))
          return send(res, 400, { error: "Valid plan required" });
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const existing = await client.query("SELECT status FROM subscriptions WHERE user_id=$1 FOR UPDATE", [user.id]);
          if (existing.rows[0]?.status === "active") {
            await client.query("ROLLBACK");
            return send(res, 409, { error: "Active plan changes require administrator review" });
          }
          const plan = await client.query("SELECT name,monthly_cents FROM plans WHERE id=$1 AND active=true", [planId]);
          if (!plan.rowCount) {
            await client.query("ROLLBACK");
            return send(res, 404, { error: "Plan unavailable" });
          }
          await client.query(
            "UPDATE invoices SET status='void' WHERE user_id=$1 AND status='unpaid' AND description LIKE '% monthly plan'",
            [user.id]
          );
          await client.query(
            "INSERT INTO subscriptions(user_id,plan_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET plan_id=excluded.plan_id,status='pending_payment'",
            [user.id, planId]
          );
          const invoiceId = randomUUID();
          await client.query(
            "INSERT INTO invoices(id,user_id,description,amount_cents) VALUES($1,$2,$3,$4)",
            [invoiceId,user.id,plan.rows[0].name + " monthly plan",plan.rows[0].monthly_cents]
          );
          await client.query("COMMIT");
          return send(res, 201, { status: "pending_payment", invoiceId });
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally { client.release(); }
      }
      if (path === "/api/numbers" && req.method === "GET") {
        const provider = new URL(req.url, origin).searchParams.get("provider");
        if (!["flowroute","didww"].includes(provider))
          return send(res, 400, { error: "Select Flowroute or DIDWW" });
        const result = await pool.query("SELECT value FROM app_settings WHERE key='did_markup_bps'");
        const markupBps = Number(result.rows[0]?.value ?? 3000);
        try {
          const numbers = await availableNumbers(provider);
          return send(res, 200, { markupPercent: markupBps / 100,
            numbers: numbers.map(({ monthlyCostCents,setupCostCents,...item }) => ({
              ...item, monthlyCents: markupCents(monthlyCostCents,markupBps),
              setupCents: markupCents(setupCostCents,markupBps)
            }))
          });
        } catch (error) {
          return send(res, 503, { error: error.message });
        }
      }
      if (path === "/api/porting" && req.method === "GET") {
        const result = await pool.query(
          "SELECT id,number_e164,provider,status,created_at FROM port_requests WHERE user_id=$1 ORDER BY created_at DESC",
          [user.id]
        );
        return send(res, 200, { requests: result.rows });
      }
      if (path === "/api/porting" && req.method === "POST") {
        const { number, provider } = await readJson(req);
        if (typeof number !== "string" || !/^\+[1-9]\d{7,14}$/.test(number) ||
            !["flowroute","didww"].includes(provider))
          return send(res, 400, { error: "Enter E.164 number and provider" });
        const result = await pool.query(
          "INSERT INTO port_requests(id,user_id,number_e164,provider) VALUES($1,$2,$3,$4) RETURNING id,status",
          [randomUUID(),user.id,number,provider]
        );
        return send(res, 201, result.rows[0]);
      }
      if (path === "/api/admin/plans" && req.method === "POST") {
        if (user.role !== "admin") return send(res, 403, { error: "Administrator required" });
        const { name, description = "", monthlyCents } = await readJson(req);
        if (typeof name !== "string" || !name.trim() || name.length > 100 ||
            typeof description !== "string" || description.length > 1000 ||
            !Number.isSafeInteger(monthlyCents) || monthlyCents < 0 || monthlyCents > 10000000)
          return send(res, 400, { error: "Valid plan name and monthly cents required" });
        const id = randomUUID();
        await pool.query(
          "INSERT INTO plans(id,name,description,monthly_cents) VALUES($1,$2,$3,$4)",
          [id,name.trim(),description,monthlyCents]
        );
        return send(res, 201, { id });
      }
      if (path === "/api/admin/markup" && req.method === "POST") {
        if (user.role !== "admin") return send(res, 403, { error: "Administrator required" });
        const { percent } = await readJson(req);
        if (!Number.isInteger(percent) || percent < 0 || percent > 1000)
          return send(res, 400, { error: "Markup must be a whole percent from 0 to 1000" });
        await pool.query(
          "INSERT INTO app_settings(key,value) VALUES('did_markup_bps',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          [String(percent * 100)]
        );
        return send(res, 200, { percent });
      }
      if (path === "/api/admin/overview" && req.method === "GET") {
        if (user.role !== "admin") return send(res, 403, { error: "Administrator required" });
        const result = await pool.query(
          "SELECT (SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM messages) AS messages, (SELECT count(*)::int FROM sessions WHERE expires_at>now()) AS active_sessions"
        );
        return send(res, 200, result.rows[0]);
      }
      if (path === "/api/admin/config" && req.method === "POST") {
        if (user.role !== "admin") return send(res, 403, { error: "Administrator required" });
        const { sipWssUrl } = await readJson(req);
        if (typeof sipWssUrl !== "string" || sipWssUrl.length > 500 ||
            (sipWssUrl !== "" && (!sipWssUrl.startsWith("wss://") || !URL.canParse(sipWssUrl))))
          return send(res, 400, { error: "A wss:// URL is required" });
        await pool.query(
          "INSERT INTO app_settings(key,value) VALUES('sip_wss_url',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          [sipWssUrl]
        );
        return send(res, 200, { sipWssUrl });
      }
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
