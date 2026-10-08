import {isAdmin} from "./tenancy.js";
import {randomUUID} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
export async function migrateDashboardViews(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS dashboard_views (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,owner_id CHAR(36) NOT NULL,
    name VARCHAR(60) NOT NULL,visibility VARCHAR(12) NOT NULL,tiles JSON NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(owner_id) REFERENCES users(id),
    INDEX tenant_views(tenant_id,visibility)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS dashboard_selections (
    user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,view_id CHAR(36) NOT NULL,
    PRIMARY KEY(user_id,tenant_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(view_id) REFERENCES dashboard_views(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}
function decode(value,fallback) {
  try{return validateTiles(typeof value==="string"?JSON.parse(value):value);}catch{return fallback;}
}
export async function handleDashboard({req,res,path,user,pool,send,readJson}) {
  if(path==="/api/admin/dashboard" && !isAdmin(user)) return send(res,403,{error:"Administrator required"});
  if(path==='/api/dashboard/views'&&req.method==='GET'){
    const views=await pool.query("SELECT id,name,visibility,tiles,version,owner_id,updated_at FROM dashboard_views WHERE tenant_id=$1 AND (visibility='tenant' OR owner_id=$2) ORDER BY visibility,name LIMIT 100",[user.tenant_id,user.id]);
    const selection=await pool.query('SELECT view_id FROM dashboard_selections WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id]);
    return send(res,200,{views:views.rows,selectedViewId:selection.rows[0]?.view_id||null,currentUserId:user.id});
  }
  if(path==='/api/dashboard/views'&&req.method==='POST'){
    const b=await readJson(req);let tiles;
    try{tiles=validateTiles(b.tiles);}catch{return send(res,400,{error:'Invalid tiles'});}
    if(typeof b.name!=='string'||b.name.trim().length<2||b.name.length>60||!['personal','tenant'].includes(b.visibility))return send(res,400,{error:'Valid view name and visibility required'});
    if(b.visibility==='tenant'&&!isAdmin(user))return send(res,403,{error:'Administrator required for tenant views'});
    if(b.visibility==='personal'&&!isAdmin(user)){
      const policy=await pool.query('SELECT allow_user_override FROM tenant_dashboards WHERE tenant_id=$1',[user.tenant_id]);
      if(policy.rows[0]&&!policy.rows[0].allow_user_override)return send(res,403,{error:'Personal views locked by tenant'});
    }
    if(tiles.some(tile=>!allowedTiles(user).includes(tile)))return send(res,403,{error:'Tile unavailable for your role'});
    const id=randomUUID();await pool.query('INSERT INTO dashboard_views(id,tenant_id,owner_id,name,visibility,tiles) VALUES($1,$2,$3,$4,$5,$6)',
      [id,user.tenant_id,user.id,b.name.trim(),b.visibility,JSON.stringify(tiles)]);
    return send(res,201,{id,version:1});
  }
  const view=/^\/api\/dashboard\/views\/([0-9a-f-]{36})$/.exec(path);
  if(view&&uuid.test(view[1])&&['PUT','DELETE'].includes(req.method)){
    const found=await pool.query('SELECT owner_id,visibility,version FROM dashboard_views WHERE id=$1 AND tenant_id=$2',[view[1],user.tenant_id]);
    const row=found.rows[0];
    if(!row)return send(res,404,{error:'View unavailable'});
    if(row.visibility==='tenant'&&!isAdmin(user)||row.visibility==='personal'&&row.owner_id!==user.id)return send(res,403,{error:'View edit access required'});
    if(req.method==='DELETE'){
      await pool.query('DELETE FROM dashboard_views WHERE id=$1 AND tenant_id=$2',[view[1],user.tenant_id]);
      return send(res,200,{deleted:true});
    }
    const b=await readJson(req);let tiles;
    try{tiles=validateTiles(b.tiles);}catch{return send(res,400,{error:'Invalid tiles'});}
    if(typeof b.name!=='string'||b.name.trim().length<2||b.name.length>60||!Number.isInteger(b.expectedVersion)||b.expectedVersion!==row.version)return send(res,409,{error:'Refresh view before editing'});
    if(tiles.some(tile=>!allowedTiles(user).includes(tile)))return send(res,403,{error:'Tile unavailable for your role'});
    const updated=await pool.query('UPDATE dashboard_views SET name=$1,tiles=$2,version=version+1 WHERE id=$3 AND tenant_id=$4 AND version=$5',
      [b.name.trim(),JSON.stringify(tiles),view[1],user.tenant_id,b.expectedVersion]);
    return send(res,updated.rowCount?200:409,updated.rowCount?{version:row.version+1}:{error:'View changed; refresh'});
  }
  const activate=/^\/api\/dashboard\/views\/([0-9a-f-]{36})\/activate$/.exec(path);
  if(activate&&uuid.test(activate[1])&&req.method==='POST'){
    const found=await pool.query("SELECT id,visibility FROM dashboard_views WHERE id=$1 AND tenant_id=$2 AND (visibility='tenant' OR owner_id=$3)",[activate[1],user.tenant_id,user.id]);
    if(!found.rowCount)return send(res,404,{error:'View unavailable'});
    const policy=await pool.query('SELECT allow_user_override FROM tenant_dashboards WHERE tenant_id=$1',[user.tenant_id]);
    if(found.rows[0].visibility==='personal'&&policy.rows[0]&&!policy.rows[0].allow_user_override&&!isAdmin(user))return send(res,403,{error:'Personal views locked by tenant'});
    await pool.query('INSERT INTO dashboard_selections(user_id,tenant_id,view_id) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE view_id=VALUES(view_id)',[user.id,user.tenant_id,activate[1]]);
    return send(res,200,{selectedViewId:activate[1]});
  }
  if(path==='/api/dashboard/views/active'&&req.method==='DELETE'){
    await pool.query('DELETE FROM dashboard_selections WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id]);
    return send(res,200,{selectedViewId:null});
  }
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
    const [tenantResult,personalResult,selectedResult]=await Promise.all([
      pool.query("SELECT tiles,allow_user_override FROM tenant_dashboards WHERE tenant_id=$1",[user.tenant_id]),
      pool.query("SELECT tiles FROM user_dashboards WHERE user_id=$1 AND tenant_id=$2",[user.id,user.tenant_id]),
      pool.query("SELECT v.id,v.tiles,v.visibility FROM dashboard_selections s JOIN dashboard_views v ON v.id=s.view_id WHERE s.user_id=$1 AND s.tenant_id=$2 AND v.tenant_id=$2 AND (v.visibility='tenant' OR v.owner_id=$1)",[user.id,user.tenant_id])
    ]);
    const tenant=tenantResult.rows[0],defaultTiles=decode(tenant?.tiles,DEFAULT_TILES);
    const canOverride=!tenant || Boolean(tenant.allow_user_override) || isAdmin(user);
    const personal=personalResult.rows[0]?decode(personalResult.rows[0].tiles,null):null;
    const selected=selectedResult.rows[0],viewTiles=selected&&((selected.visibility==='tenant')||canOverride)?decode(selected.tiles,null):null;
    const available=allowedTiles(user),chosen=viewTiles||(canOverride&&personal?personal:defaultTiles);
    return send(res,200,{tiles:chosen.filter(tile=>available.includes(tile)),selectedViewId:viewTiles?selected.id:null,tenantTiles:defaultTiles,
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
