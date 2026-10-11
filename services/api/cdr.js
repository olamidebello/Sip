import { createHmac, createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { isAdmin } from "./tenancy.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const e164 = /^\+[1-9]\d{7,14}$/;
const identifier = /^[a-zA-Z0-9_.:-]{1,80}$/;

export function verifyCdrSignature(secret, timestamp, body, signature, now = Date.now()) {
  if (typeof secret !== "string" || secret.length < 32 ||
      typeof timestamp !== "string" || typeof signature !== "string" ||
      !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature) ||
      Math.abs(now - Number(timestamp) * 1000) > 300000) return false;
  const expected = createHmac("sha256", secret).update(timestamp + "." + body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function validateCdr(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !uuid.test(body.tenantId || "") || !identifier.test(body.source || "") ||
      !identifier.test(body.legId || "") || !["inbound","outbound"].includes(body.direction) ||
      !e164.test(body.from || "") || !e164.test(body.to || "") ||
      !["answered","missed","rejected","failed"].includes(body.disposition) ||
      !Number.isSafeInteger(body.durationSeconds) || body.durationSeconds < 0 ||
      body.durationSeconds > 2592000 ||
      !Number.isSafeInteger(body.billableSeconds) || body.billableSeconds < 0 ||
      body.billableSeconds > body.durationSeconds ||
      (body.disposition !== "answered" && body.billableSeconds !== 0) ||
      typeof body.startedAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(body.startedAt) ||
      !Number.isFinite(Date.parse(body.startedAt)))
    throw new Error("Invalid normalized CDR");
  const started = Date.parse(body.startedAt);
  if (started > Date.now() + 300000 || started < Date.now() - 366 * 86400000)
    throw new Error("CDR start time outside accepted window");
  return body;
}

export async function handleCdrIngest({req,res,pool,send,keys}) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    return send(res,400,{error:"JSON required"});
  let raw = "";
  try {
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 8192) return send(res,413,{error:"CDR too large"});
    }
    const body = validateCdr(JSON.parse(raw));
    const secret = keys[body.tenantId];
    if (!verifyCdrSignature(secret,req.headers["x-cdr-timestamp"],raw,req.headers["x-cdr-signature"]))
      return send(res,401,{error:"Invalid CDR signature"});
    const tenant = await pool.query("SELECT id FROM tenants WHERE id=$1",[body.tenantId]);
    if (!tenant.rowCount) return send(res,404,{error:"Tenant unavailable"});
    const digest = createHash("sha256").update(raw).digest("hex");
    try {
      await pool.query("INSERT INTO cdr_records(id,tenant_id,source,leg_id,payload_hash,direction,caller_e164,callee_e164,disposition,duration_seconds,billable_seconds,started_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [randomUUID(),body.tenantId,body.source,body.legId,digest,body.direction,body.from,body.to,body.disposition,body.durationSeconds,body.billableSeconds,body.startedAt.slice(0,-1).replace("T"," ")]);
      return send(res,201,{accepted:true,charged:false});
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") throw error;
      const found = await pool.query("SELECT payload_hash FROM cdr_records WHERE tenant_id=$1 AND source=$2 AND leg_id=$3",
        [body.tenantId,body.source,body.legId]);
      if (found.rows[0]?.payload_hash === digest) return send(res,200,{accepted:true,duplicate:true,charged:false});
      return send(res,409,{error:"CDR leg already exists with different content"});
    }
  } catch (error) {
    if (error instanceof SyntaxError || error.message?.startsWith("Invalid normalized") ||
        error.message?.startsWith("CDR start"))
      return send(res,400,{error:"Invalid normalized CDR"});
    throw error;
  }
}

export function cdrFilters(url){
  const q=new URL(url,'http://localhost').searchParams;
  const direction=q.get('direction')||'',disposition=q.get('disposition')||'',source=q.get('source')||'';
  const page=Number(q.get('page')||1);
  if(direction&&!['inbound','outbound'].includes(direction)||
    disposition&&!['answered','missed','rejected','failed'].includes(disposition)||
    source&&!identifier.test(source)||!Number.isSafeInteger(page)||page<1||page>100)
    throw new RangeError('Invalid CDR filter');
  return {direction,disposition,source,page};
}
export async function handleCdrAdmin({req,res,user,pool,send}) {
  if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
  let filter;try{filter=cdrFilters(req.url);}catch(error){return send(res,400,{error:error.message});}
  const params=[user.tenant_id,filter.direction,filter.disposition,filter.source];
  const where=`tenant_id=$1 AND ($2='' OR direction=$2) AND ($3='' OR disposition=$3) AND ($4='' OR source=$4)`;
  const records=await pool.query(`SELECT id,source,leg_id,direction,caller_e164,callee_e164,disposition,duration_seconds,billable_seconds,started_at,received_at
    FROM cdr_records WHERE ${where} ORDER BY received_at DESC,id DESC LIMIT 101 OFFSET $5`,[...params,(filter.page-1)*100]);
  return send(res,200,{records:records.rows.slice(0,100),page:filter.page,hasMore:records.rows.length>100,
    charged:false,note:'Unrated switch-imported records. No payment or balance changes.'});
}
