import {randomUUID} from "node:crypto";

const sipAddress=/^sip:[^\s@]+@[^\s@]+$/i;
export function validatePreferences(value) {
  if (!value || typeof value!=="object" || Array.isArray(value) ||
      Object.keys(value).some(key=>!["dnd","favorites"].includes(key)) ||
      typeof value.dnd!=="boolean" || !Array.isArray(value.favorites) || value.favorites.length>100 ||
      value.favorites.some(address=>typeof address!=="string" || address.length>255 || !sipAddress.test(address)))
    throw new Error("Valid do not disturb and up to 100 SIP favorites required");
  return {dnd:value.dnd,favorites:[...new Set(value.favorites)]};
}
export function validateCallEvent(value) {
  if (!value || typeof value!=="object" || Array.isArray(value) ||
      !["incoming","outgoing"].includes(value.direction) ||
      typeof value.address!=="string" || value.address.length>255 ||
      !(sipAddress.test(value.address) || value.address==="Unknown caller") ||
      !["completed","missed or unanswered","failed","declined","declined (do not disturb)"].includes(value.result))
    throw new Error("Valid call event required");
  return {direction:value.direction,address:value.address,result:value.result};
}
export async function migrateSoftphoneState(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS softphone_preferences (
    user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,dnd BOOLEAN NOT NULL DEFAULT FALSE,
    favorites JSON NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY(user_id,tenant_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX softphone_preferences_tenant(tenant_id)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS softphone_call_events (
    id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,
    direction VARCHAR(16) NOT NULL,address VARCHAR(255) NOT NULL,result VARCHAR(40) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX softphone_events_user_created(user_id,created_at),INDEX softphone_events_tenant(tenant_id)) ENGINE=InnoDB`);
}
export async function handleSoftphoneState({req,res,path,user,pool,send,readJson}) {
  if (path==="/api/softphone/preferences" && req.method==="GET") {
    const data=await pool.query("SELECT dnd,favorites FROM softphone_preferences WHERE user_id=$1 AND tenant_id=$2",[user.id,user.tenant_id]);
    const row=data.rows[0];
    const favorites=typeof row?.favorites==="string"?JSON.parse(row.favorites):row?.favorites;
    return send(res,200,{dnd:Boolean(row?.dnd),favorites:Array.isArray(favorites)?favorites:[]});
  }
  if (path==="/api/softphone/preferences" && req.method==="PUT") {
    let value;
    try {value=validatePreferences(await readJson(req));}
    catch(error) {return send(res,400,{error:error.message});}
    await pool.query("INSERT INTO softphone_preferences(user_id,tenant_id,dnd,favorites) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE dnd=VALUES(dnd),favorites=VALUES(favorites)",
      [user.id,user.tenant_id,value.dnd,JSON.stringify(value.favorites)]);
    return send(res,200,value);
  }
  if (path==="/api/softphone/calls" && req.method==="GET") {
    const result=await pool.query("SELECT id,direction,address,result,created_at AS at FROM softphone_call_events WHERE user_id=$1 AND tenant_id=$2 ORDER BY created_at DESC,id DESC LIMIT 50",[user.id,user.tenant_id]);
    return send(res,200,{calls:result.rows});
  }
  if (path==="/api/softphone/calls" && req.method==="POST") {
    let value;
    try {value=validateCallEvent(await readJson(req));}
    catch(error) {return send(res,400,{error:error.message});}
    const id=randomUUID();
    await pool.query("INSERT INTO softphone_call_events(id,user_id,tenant_id,direction,address,result) VALUES($1,$2,$3,$4,$5,$6)",
      [id,user.id,user.tenant_id,value.direction,value.address,value.result]);
    return send(res,201,{id,...value});
  }
  if (path==="/api/softphone/calls" && req.method==="DELETE") {
    await pool.query("DELETE FROM softphone_call_events WHERE user_id=$1 AND tenant_id=$2",[user.id,user.tenant_id]);
    return send(res,200,{status:"cleared"});
  }
  return send(res,404,{error:"Softphone route unavailable"});
}
