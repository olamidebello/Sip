import { randomUUID } from "node:crypto";
import { isAdmin } from "./tenancy.js";
const uuid = /^[0-9a-f-]{36}$/i;
const extensionNumber = /^\d{2,10}$/;
const e164 = /^\+[1-9]\d{7,14}$/;
const strategies = ["ring_all","ordered","longest_idle"];
const statusValues = ["ready","away","offline"];
const validName = (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 100;
export function selectAgents(members, strategy) {
  const ready = members.filter((member) => member.status === "ready");
  if (strategy === "longest_idle") ready.sort((a,b) => new Date(a.changed_at) - new Date(b.changed_at) || a.position-b.position);
  else ready.sort((a,b) => a.position-b.position);
  return strategy === "ring_all" ? ready : ready.slice(0,1);
}
export function evaluateOutboundPolicy(number, policies) {
  const digits = number.slice(1);
  const matching = policies.filter((policy) => digits.startsWith(policy.prefix))
    .sort((a,b) => b.prefix.length-a.prefix.length);
  const policy = matching[0] || null;
  return {allowed:policy?.action !== "block",policy};
}
export async function handlePbx({req,res,path,user,pool,send,readJson}) {
  const admin = isAdmin(user), tenant = user.tenant_id;
  if (path === "/api/pbx/my-extension" && req.method === "GET") {
    const result = await pool.query("SELECT d.id,d.number,d.name,e.voicemail_enabled,e.forward_to FROM pbx_extensions e JOIN pbx_destinations d ON d.id=e.destination_id WHERE e.user_id=$1 AND e.tenant_id=$2",[user.id,tenant]);
    return send(res,200,{extension:result.rows[0] || null});
  }
  if (path === "/api/pbx/agent-status" && req.method === "POST") {
    if (!user.features.call_center) return send(res,403,{error:"Call center access unavailable"});
    const {status} = await readJson(req);
    if (!statusValues.includes(status)) return send(res,400,{error:"Invalid agent status"});
    await pool.query("INSERT INTO pbx_agent_status(user_id,status) VALUES($1,$2) ON DUPLICATE KEY UPDATE status=$3,changed_at=UTC_TIMESTAMP(3)",[user.id,status,status]);
    return send(res,200,{status});
  }
  if (path === "/api/pbx/agent-status" && req.method === "GET") {
    if (!admin) {
      const found = await pool.query("SELECT status,changed_at FROM pbx_agent_status WHERE user_id=$1",[user.id]);
      return send(res,200,{status:found.rows[0]?.status || "offline",changedAt:found.rows[0]?.changed_at || null});
    }
    const rows = await pool.query("SELECT u.id,u.display_name AS name,COALESCE(s.status,'offline') AS status,s.changed_at FROM users u LEFT JOIN pbx_agent_status s ON s.user_id=u.id WHERE u.tenant_id=$1 ORDER BY u.display_name LIMIT 200",[tenant]);
    return send(res,200,{agents:rows.rows});
  }
  if (!admin) return send(res,403,{error:"Administrator required"});
  if (path === "/api/pbx/overview" && req.method === "GET") {
    const [result,switchState] = await Promise.all([
      pool.query("SELECT (SELECT COUNT(*) FROM pbx_destinations WHERE tenant_id=$1 AND kind='extension') AS extensions,(SELECT COUNT(*) FROM pbx_destinations WHERE tenant_id=$2 AND kind='queue') AS queues,(SELECT COUNT(*) FROM pbx_inbound_routes WHERE tenant_id=$3) AS inbound_routes,(SELECT COUNT(*) FROM pbx_trunks WHERE tenant_id=$4) AS trunks",[tenant,tenant,tenant,tenant]),
      pool.query("SELECT enabled FROM switch_tenants WHERE tenant_id=$1",[tenant])
    ]);
    return send(res,200,{...result.rows[0],switchConfigured:!!switchState.rows[0]?.enabled,
      switchConnected:false,note:"FreeSWITCH lookups may be enabled, but this API does not verify switch runtime or enforce charging. Queue and public DID routes remain planning records."});
  }
  if (path === "/api/pbx/extensions" && req.method === "GET") {
    const found = await pool.query("SELECT d.id,d.number,d.name,d.enabled,e.user_id,e.voicemail_enabled,e.forward_to FROM pbx_destinations d JOIN pbx_extensions e ON e.destination_id=d.id WHERE d.tenant_id=$1 ORDER BY d.number",[tenant]);
    return send(res,200,{extensions:found.rows});
  }
  if (path === "/api/pbx/extensions" && req.method === "POST") {
    const body = await readJson(req);
    if (!extensionNumber.test(body.number || "") || !validName(body.name) ||
        (body.userId != null && !uuid.test(body.userId)) ||
        typeof body.voicemailEnabled !== "boolean" ||
        (body.forwardTo && !(extensionNumber.test(body.forwardTo) || e164.test(body.forwardTo))) ||
        body.forwardTo === body.number)
      return send(res,400,{error:"Valid extension, name, user, voicemail and forwarding target required"});
    if (body.userId) {
      const target = await pool.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2",[body.userId,tenant]);
      if (!target.rowCount) return send(res,404,{error:"User unavailable in this tenant"});
    }
    const id = randomUUID(), db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("INSERT INTO pbx_destinations(id,tenant_id,number,kind,name) VALUES($1,$2,$3,'extension',$4)",[id,tenant,body.number,body.name.trim()]);
      await db.query("INSERT INTO pbx_extensions(destination_id,tenant_id,user_id,voicemail_enabled,forward_to) VALUES($1,$2,$3,$4,$5)",[id,tenant,body.userId || null,body.voicemailEnabled,body.forwardTo || null]);
      await db.query("COMMIT");
      return send(res,201,{id,number:body.number});
    } catch (error) {
      await db.query("ROLLBACK");
      if (error.code === "ER_DUP_ENTRY") return send(res,409,{error:"Extension number or user already assigned"});
      throw error;
    } finally { db.release(); }
  }
  if (path === "/api/pbx/queues" && req.method === "GET") {
    const found = await pool.query("SELECT d.id,d.number,d.name,q.strategy,q.max_wait_seconds FROM pbx_destinations d JOIN pbx_queues q ON q.destination_id=d.id WHERE d.tenant_id=$1 ORDER BY d.number",[tenant]);
    const membership = await pool.query("SELECT m.queue_id,m.user_id,m.position FROM pbx_queue_members m JOIN pbx_queues q ON q.destination_id=m.queue_id WHERE q.tenant_id=$1 ORDER BY m.position",[tenant]);
    return send(res,200,{queues:found.rows.map((queue) => ({...queue,members:membership.rows.filter((m) => m.queue_id === queue.id)}))});
  }
  if (path === "/api/pbx/queues" && req.method === "POST") {
    const body = await readJson(req);
    if (!extensionNumber.test(body.number || "") || !validName(body.name) ||
        !strategies.includes(body.strategy) || !Number.isInteger(body.maxWaitSeconds) ||
        body.maxWaitSeconds < 5 || body.maxWaitSeconds > 3600)
      return send(res,400,{error:"Valid queue number, name, strategy and wait time required"});
    const id = randomUUID(), db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("INSERT INTO pbx_destinations(id,tenant_id,number,kind,name) VALUES($1,$2,$3,'queue',$4)",[id,tenant,body.number,body.name.trim()]);
      await db.query("INSERT INTO pbx_queues(destination_id,tenant_id,strategy,max_wait_seconds) VALUES($1,$2,$3,$4)",[id,tenant,body.strategy,body.maxWaitSeconds]);
      await db.query("COMMIT");
      return send(res,201,{id,number:body.number});
    } catch (error) {
      await db.query("ROLLBACK");
      if (error.code === "ER_DUP_ENTRY") return send(res,409,{error:"Dialplan number already assigned"});
      throw error;
    } finally { db.release(); }
  }
  const queueMatch = /^\/api\/pbx\/queues\/([0-9a-f-]{36})\/(members|preview)$/i.exec(path);
  if (queueMatch && uuid.test(queueMatch[1])) {
    const [ , queueId, operation] = queueMatch;
    if (operation === "members" && req.method === "PUT") {
      const {userIds} = await readJson(req);
      if (!Array.isArray(userIds) || userIds.length > 50 || userIds.some((id) => !uuid.test(id)) || new Set(userIds).size !== userIds.length)
        return send(res,400,{error:"Up to 50 distinct valid user IDs required"});
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const queue = await db.query("SELECT destination_id FROM pbx_queues WHERE destination_id=$1 AND tenant_id=$2 FOR UPDATE",[queueId,tenant]);
        if (!queue.rowCount) { await db.query("ROLLBACK"); return send(res,404,{error:"Queue unavailable"}); }
        if (userIds.length) {
          const vars = userIds.map((_,i) => "$" + (i+2)).join(",");
          const found = await db.query(`SELECT id FROM users WHERE tenant_id=$1 AND id IN (${vars})`,[tenant,...userIds]);
          if (found.rowCount !== userIds.length) { await db.query("ROLLBACK"); return send(res,400,{error:"User outside tenant"}); }
        }
        await db.query("DELETE FROM pbx_queue_members WHERE queue_id=$1",[queueId]);
        for (let i=0;i<userIds.length;i++) await db.query("INSERT INTO pbx_queue_members(queue_id,user_id,position) VALUES($1,$2,$3)",[queueId,userIds[i],i+1]);
        await db.query("COMMIT");
        return send(res,200,{userIds});
      } catch (error) { await db.query("ROLLBACK"); throw error; }
      finally { db.release(); }
    }
    if (operation === "preview" && req.method === "GET") {
      const found = await pool.query("SELECT strategy FROM pbx_queues WHERE destination_id=$1 AND tenant_id=$2",[queueId,tenant]);
      if (!found.rowCount) return send(res,404,{error:"Queue unavailable"});
      const members = await pool.query("SELECT m.user_id,m.position,COALESCE(s.status,'offline') AS status,s.changed_at FROM pbx_queue_members m JOIN users u ON u.id=m.user_id LEFT JOIN pbx_agent_status s ON s.user_id=u.id WHERE m.queue_id=$1 AND u.tenant_id=$2",[queueId,tenant]);
      return send(res,200,{eligible:selectAgents(members.rows,found.rows[0].strategy),simulation:true});
    }
  }
  if (path === "/api/pbx/inbound-routes" && req.method === "GET") {
    const found = await pool.query("SELECT r.id,r.did_e164,r.destination_id,d.number AS destination_number,d.name AS destination_name FROM pbx_inbound_routes r JOIN pbx_destinations d ON d.id=r.destination_id WHERE r.tenant_id=$1 ORDER BY r.did_e164",[tenant]);
    return send(res,200,{routes:found.rows});
  }
  if (path === "/api/pbx/inbound-routes" && req.method === "POST") {
    const {did,destinationId} = await readJson(req);
    if (!e164.test(did || "") || !uuid.test(destinationId || "")) return send(res,400,{error:"E.164 DID and destination required"});
    const target = await pool.query("SELECT id FROM pbx_destinations WHERE id=$1 AND tenant_id=$2 AND enabled=true",[destinationId,tenant]);
    if (!target.rowCount) return send(res,404,{error:"Destination unavailable"});
    const id = randomUUID();
    await pool.query("INSERT INTO pbx_inbound_routes(id,tenant_id,did_e164,destination_id) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE destination_id=$5",
      [id,tenant,did,destinationId,destinationId]);
    return send(res,200,{did,destinationId});
  }
  if (path === "/api/pbx/trunks" && req.method === "GET") {
    const found = await pool.query("SELECT id,name,host,port,transport,priority,enabled FROM pbx_trunks WHERE tenant_id=$1 ORDER BY priority,name",[tenant]);
    return send(res,200,{trunks:found.rows});
  }
  if (path === "/api/pbx/trunks" && req.method === "POST") {
    const body = await readJson(req);
    if (!validName(body.name) || typeof body.host !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,253}$/.test(body.host) ||
        !Number.isInteger(body.port) || body.port < 1 || body.port > 65535 ||
        !["udp","tcp","tls"].includes(body.transport) ||
        !Number.isInteger(body.priority) || body.priority < 1 || body.priority > 1000)
      return send(res,400,{error:"Valid trunk name, host, port, transport and priority required"});
    const id = randomUUID();
    try {
      await pool.query("INSERT INTO pbx_trunks(id,tenant_id,name,host,port,transport,priority) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id,tenant,body.name.trim(),body.host.toLowerCase(),body.port,body.transport,body.priority]);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return send(res,409,{error:"Trunk name exists"});
      throw error;
    }
    return send(res,201,{id,enabled:false});
  }
  const trunkMatch = /^\/api\/pbx\/trunks\/([0-9a-f-]{36})\/status$/i.exec(path);
  if (trunkMatch && req.method === "PUT") {
    const {enabled} = await readJson(req);
    if (typeof enabled !== "boolean") return send(res,400,{error:"Boolean enabled required"});
    const result = await pool.query("UPDATE pbx_trunks SET enabled=$1 WHERE id=$2 AND tenant_id=$3",[enabled,trunkMatch[1],tenant]);
    return send(res,result.rowCount ? 200 : 404,result.rowCount ? {enabled,simulationOnly:true} : {error:"Trunk unavailable"});
  }
  if (path === "/api/pbx/rates" && req.method === "GET") {
    const found = await pool.query("SELECT r.id,r.prefix,r.cost_cents_per_minute,r.price_cents_per_minute,r.enabled,t.name AS trunk_name,r.trunk_id FROM pbx_rates r JOIN pbx_trunks t ON t.id=r.trunk_id WHERE r.tenant_id=$1 ORDER BY r.prefix,t.priority LIMIT 500",[tenant]);
    return send(res,200,{rates:found.rows});
  }
  if (path === "/api/pbx/outbound-policies" && req.method === "GET") {
    const result = await pool.query("SELECT id,prefix,action,reason,created_at FROM pbx_outbound_policies WHERE tenant_id=$1 ORDER BY CHAR_LENGTH(prefix) DESC,prefix LIMIT 500",[tenant]);
    return send(res,200,{policies:result.rows,simulationOnly:true});
  }
  if (path === "/api/pbx/outbound-policies" && req.method === "POST") {
    const body = await readJson(req);
    if (!/^\d{1,15}$/.test(body.prefix || "") || !["allow","block"].includes(body.action) ||
        typeof body.reason !== "string" || body.reason.length > 200)
      return send(res,400,{error:"Valid digits prefix, action and reason (max 200 characters) required"});
    const id = randomUUID();
    await pool.query("INSERT INTO pbx_outbound_policies(id,tenant_id,prefix,action,reason) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE action=$6,reason=$7",
      [id,tenant,body.prefix,body.action,body.reason.trim(),body.action,body.reason.trim()]);
    return send(res,200,{prefix:body.prefix,action:body.action,simulationOnly:true});
  }
  const policyMatch = /^\/api\/pbx\/outbound-policies\/([0-9a-f-]{36})$/i.exec(path);
  if (policyMatch && req.method === "DELETE") {
    const result = await pool.query("DELETE FROM pbx_outbound_policies WHERE id=$1 AND tenant_id=$2",[policyMatch[1],tenant]);
    return send(res,result.rowCount ? 200 : 404,result.rowCount ? {deleted:true} : {error:"Policy unavailable"});
  }
  if (path === "/api/pbx/rates" && req.method === "POST") {
    const body = await readJson(req);
    if (!/^\d{1,15}$/.test(body.prefix || "") || !uuid.test(body.trunkId || "") ||
        !Number.isSafeInteger(body.costCentsPerMinute) || body.costCentsPerMinute < 0 || body.costCentsPerMinute > 1000000 ||
        !Number.isSafeInteger(body.priceCentsPerMinute) || body.priceCentsPerMinute < body.costCentsPerMinute || body.priceCentsPerMinute > 1000000)
      return send(res,400,{error:"Valid prefix, trunk, cost and price in cents required"});
    const trunk = await pool.query("SELECT id FROM pbx_trunks WHERE id=$1 AND tenant_id=$2",[body.trunkId,tenant]);
    if (!trunk.rowCount) return send(res,404,{error:"Trunk unavailable"});
    const id = randomUUID();
    try {
      await pool.query("INSERT INTO pbx_rates(id,tenant_id,trunk_id,prefix,cost_cents_per_minute,price_cents_per_minute) VALUES($1,$2,$3,$4,$5,$6)",
        [id,tenant,body.trunkId,body.prefix,body.costCentsPerMinute,body.priceCentsPerMinute]);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return send(res,409,{error:"Rate for trunk and prefix exists"});
      throw error;
    }
    return send(res,201,{id});
  }
  if (path === "/api/pbx/route-preview" && req.method === "GET") {
    const number = new URL(req.url,"http://localhost").searchParams.get("number");
    if (!e164.test(number || "")) return send(res,400,{error:"E.164 number required"});
    const policies = await pool.query("SELECT prefix,action,reason FROM pbx_outbound_policies WHERE tenant_id=$1 AND $2 LIKE CONCAT(prefix,'%') ORDER BY CHAR_LENGTH(prefix) DESC LIMIT 1",
      [tenant,number.slice(1)]);
    const decision = evaluateOutboundPolicy(number,policies.rows);
    if (!decision.allowed) return send(res,200,{route:null,blocked:true,policy:decision.policy,simulation:true});
    const found = await pool.query("SELECT r.prefix,r.cost_cents_per_minute,r.price_cents_per_minute,t.name AS trunk_name,t.host,t.port,t.transport FROM pbx_rates r JOIN pbx_trunks t ON t.id=r.trunk_id WHERE r.tenant_id=$1 AND t.tenant_id=$2 AND r.enabled=true AND t.enabled=true AND $3 LIKE CONCAT(r.prefix,'%') ORDER BY CHAR_LENGTH(r.prefix) DESC,r.cost_cents_per_minute ASC,t.priority ASC LIMIT 1",
      [tenant,tenant,number.slice(1)]);
    return send(res,200,{route:found.rows[0] || null,blocked:false,policy:decision.policy,simulation:true});
  }
  return send(res,404,{error:"PBX route unavailable"});
}
