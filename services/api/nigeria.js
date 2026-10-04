import { randomUUID } from "node:crypto";
import { isAdmin } from "./tenancy.js";

export function validateNigeriaPeer(body) {
  if (typeof body?.name !== "string" || !body.name.trim() || body.name.length>100 ||
      !["clearinghouse","operator"].includes(body.peerType) ||
      typeof body.host !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9.:-]{0,253}$/.test(body.host) ||
      !Number.isInteger(body.port) || body.port<1 || body.port>65535 ||
      !["tls","tcp","udp"].includes(body.transport) ||
      !/^234\d{0,12}$/.test(body.destinationPrefix || "") ||
      typeof body.agreementReference !== "string" ||
      !body.agreementReference.trim() || body.agreementReference.length>255)
    throw new Error("Valid peer, +234 prefix and interconnect agreement reference required");
  return body;
}
export async function handleNigeria({req,res,path,user,pool,send,readJson}) {
  if (path === "/api/nigeria/nin/status" && req.method === "GET") {
    return send(res,200,{provider:"NINAuth",connected:false,verified:false,
      note:"No enterprise app, consent callback, PKCE exchange or identity verification is configured. Do not enter a NIN."});
  }
  if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
  if (path === "/api/admin/nigeria/peers" && req.method === "GET") {
    const result=await pool.query("SELECT id,name,peer_type,host,port,transport,destination_prefix,agreement_reference,status FROM nigeria_interconnect_peers WHERE tenant_id=$1 ORDER BY name LIMIT 100",[user.tenant_id]);
    return send(res,200,{peers:result.rows,live:false});
  }
  if (path === "/api/admin/nigeria/peers" && req.method === "POST") {
    let body;
    try {body=validateNigeriaPeer(await readJson(req));}
    catch(error) {return send(res,400,{error:error.message});}
    const id=randomUUID();
    try {
      await pool.query("INSERT INTO nigeria_interconnect_peers(id,tenant_id,name,peer_type,host,port,transport,destination_prefix,agreement_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [id,user.tenant_id,body.name.trim(),body.peerType,body.host.toLowerCase(),
          body.port,body.transport,body.destinationPrefix,body.agreementReference.trim()]);
    } catch(error) {
      if (error.code==="ER_DUP_ENTRY") return send(res,409,{error:"Peer name already exists"});
      throw error;
    }
    return send(res,201,{id,status:"planned",live:false});
  }
  if (path === "/api/admin/nigeria/preview" && req.method === "GET") {
    const number=new URL(req.url,"http://localhost").searchParams.get("number");
    if (!/^\+234\d{7,12}$/.test(number || "")) return send(res,400,{error:"Valid +234 number required"});
    const result=await pool.query("SELECT id,name,peer_type,host,port,transport,destination_prefix FROM nigeria_interconnect_peers WHERE tenant_id=$1 AND status='planned' AND $2 LIKE CONCAT(destination_prefix,'%') ORDER BY CHAR_LENGTH(destination_prefix) DESC,name LIMIT 1",
      [user.tenant_id,number.slice(1)]);
    return send(res,200,{peer:result.rows[0] || null,simulation:true,live:false});
  }
  return send(res,404,{error:"Nigeria integration route unavailable"});
}
