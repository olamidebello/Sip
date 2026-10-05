import {isAdmin} from "./tenancy.js";

export const TILES=["dialer","messages","billing","meetings","support","agent","admin","reports"];
export const DEFAULT_TILES=["dialer","messages","billing","meetings","support","agent","admin"];
export function validateTiles(value) {
  if(!Array.isArray(value) || value.length<1 || value.length>TILES.length ||
     new Set(value).size!==value.length || value.some(tile=>!TILES.includes(tile)))
    throw new TypeError("Choose distinct dashboard tiles from the available list");
  return value;
}
function allowedTiles(user) {
  return TILES.filter(tile=>tile==="dialer" || tile==="support" ||
    (tile==="messages" && user.features.messaging) ||
    (tile==="billing" && user.features.billing) ||
    (tile==="meetings" && user.features.meetings) ||
    (tile==="agent" && user.features.call_center) ||
    (["admin","reports"].includes(tile) && isAdmin(user)));
}
export async function migrateDashboard(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS tenant_dashboards (
    tenant_id CHAR(36) PRIMARY KEY,tiles JSON NOT NULL,allow_user_override BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by CHAR(36) NOT NULL,FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_dashboards (
    user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,tiles JSON NOT NULL,
    PRIMARY KEY(user_id,tenant_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
}
function decode(value,fallback) {
  try{return validateTiles(typeof value==="string"?JSON.parse(value):value);}catch{return fallback;}
}
export async function handleDashboard({req,res,path,user,pool,send,readJson}) {
  if(path==="/api/admin/dashboard" && !isAdmin(user)) return send(res,403,{error:"Administrator required"});
  if(path==="/api/dashboard/summary" && req.method==="GET") {
    const summary={};
    const jobs=[];
    const count=(key,sql,params)=>jobs.push(pool.query(sql,params).then(result=>{summary[key]=Number(result.rows[0]?.total??0);}));
    if(user.features.messaging) {
      count("contacts","SELECT COUNT(*) AS total FROM contacts WHERE owner_id=$1",[user.id]);
      count("messages","SELECT COUNT(*) AS total FROM messages WHERE sender_id=$1 OR recipient_id=$2",[user.id,user.id]);
    }
    if(user.features.billing) count("unpaidInvoices","SELECT COUNT(*) AS total FROM invoices WHERE user_id=$1 AND status='unpaid'",[user.id]);
    if(user.features.meetings) count("openMeetings","SELECT COUNT(*) AS total FROM meeting_rooms WHERE host_id=$1 AND ended_at IS NULL",[user.id]);
    count("openTickets",`SELECT COUNT(*) AS total FROM support_tickets WHERE tenant_id=$1 ${isAdmin(user)?"":"AND requester_id=$2"} AND status NOT IN ('resolved','closed')`,
      isAdmin(user)?[user.tenant_id]:[user.tenant_id,user.id]);
    if(isAdmin(user)) count("tenantUsers","SELECT COUNT(*) AS total FROM users WHERE tenant_id=$1",[user.tenant_id]);
    await Promise.all(jobs);
    return send(res,200,{summary,updatedAt:new Date().toISOString(),note:"App records only; no live switch, payment, or carrier telemetry"});
  }
  if(req.method==="GET") {
    const [tenantResult,personalResult]=await Promise.all([
      pool.query("SELECT tiles,allow_user_override FROM tenant_dashboards WHERE tenant_id=$1",[user.tenant_id]),
      pool.query("SELECT tiles FROM user_dashboards WHERE user_id=$1 AND tenant_id=$2",[user.id,user.tenant_id])
    ]);
    const tenant=tenantResult.rows[0],defaultTiles=decode(tenant?.tiles,DEFAULT_TILES);
    const canOverride=!tenant || Boolean(tenant.allow_user_override) || isAdmin(user);
    const personal=personalResult.rows[0]?decode(personalResult.rows[0].tiles,null):null;
    const available=allowedTiles(user),chosen=canOverride&&personal?personal:defaultTiles;
    return send(res,200,{tiles:chosen.filter(tile=>available.includes(tile)),tenantTiles:defaultTiles,
      personalTiles:personal,available,canOverride,allowUserOverride:tenant?Boolean(tenant.allow_user_override):true});
  }
  if(path==="/api/dashboard" && req.method==="PUT") {
    const policy=await pool.query("SELECT allow_user_override FROM tenant_dashboards WHERE tenant_id=$1",[user.tenant_id]);
    if(policy.rows[0] && !policy.rows[0].allow_user_override && !isAdmin(user))
      return send(res,403,{error:"Dashboard layout locked by administrator"});
    let tiles;
    try{tiles=validateTiles((await readJson(req)).tiles);}catch{return send(res,400,{error:"Invalid dashboard tiles"});}
    if(tiles.some(tile=>!allowedTiles(user).includes(tile))) return send(res,403,{error:"Tile unavailable for your role"});
    await pool.query("INSERT INTO user_dashboards(user_id,tenant_id,tiles) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE tiles=VALUES(tiles)",
      [user.id,user.tenant_id,JSON.stringify(tiles)]);
    return send(res,200,{tiles});
  }
  if(path==="/api/dashboard" && req.method==="DELETE") {
    await pool.query("DELETE FROM user_dashboards WHERE user_id=$1 AND tenant_id=$2",[user.id,user.tenant_id]);
    return send(res,200,{status:"reset"});
  }
  if(path==="/api/admin/dashboard" && req.method==="PUT") {
    const data=await readJson(req);let tiles;
    try{tiles=validateTiles(data.tiles);}catch{return send(res,400,{error:"Invalid dashboard tiles"});}
    if(typeof data.allowUserOverride!=="boolean") return send(res,400,{error:"Override policy required"});
    await pool.query("INSERT INTO tenant_dashboards(tenant_id,tiles,allow_user_override,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE tiles=VALUES(tiles),allow_user_override=VALUES(allow_user_override),updated_by=VALUES(updated_by)",
      [user.tenant_id,JSON.stringify(tiles),data.allowUserOverride,user.id]);
    return send(res,200,{tenantTiles:tiles,allowUserOverride:data.allowUserOverride});
  }
  return send(res,404,{error:"Dashboard route unavailable"});
}
