import { randomUUID } from "node:crypto";
import { isAdmin } from "./tenancy.js";

export function validInhouseDid(number) {
  if (typeof number !== "string" || !/^\+[1-9]\d{7,14}$/.test(number)) return false;
  if (!number.startsWith("+1")) return true;
  return /^\+1[2-9]\d{2}[2-9]\d{2}\d{4}$/.test(number);
}
export function nigeriaBlockNumber(prefix,suffix) {
  if (!/^20315[0-4]$/.test(prefix) || !Number.isInteger(suffix) || suffix<0 || suffix>9999) return null;
  return `+234${prefix}${String(suffix).padStart(4,"0")}`;
}
function validPrice(value) { return Number.isSafeInteger(value) && value>=0 && value<=10000000; }
export async function handleInhouseDids({req,res,path,user,pool,send,readJson}) {
  const tenant = user.tenant_id;
  if (path === "/api/inhouse/numbers" && req.method === "GET") {
    const q = new URL(req.url,"http://localhost").searchParams.get("q") || "";
    if (q && !/^\+?[0-9]{1,15}$/.test(q)) return send(res,400,{error:"Digits search required"});
    const rows = await pool.query("SELECT id,number_e164,setup_cents,monthly_cents FROM inhouse_dids WHERE tenant_id=$1 AND status='available' AND number_e164 LIKE CONCAT($2,'%') ORDER BY number_e164 LIMIT 30",
      [tenant,q]);
    return send(res,200,{numbers:rows.rows, note:"Request only. No payment gateway or live switch provisioning."});
  }
  if (path === "/api/inhouse/my-numbers" && req.method === "GET") {
    const rows = await pool.query("SELECT d.id,d.number_e164,d.status,d.reserved_until,d.setup_cents,d.monthly_cents,i.status AS invoice_status FROM inhouse_dids d LEFT JOIN invoices i ON i.id=d.invoice_id WHERE d.tenant_id=$1 AND d.user_id=$2 ORDER BY d.created_at DESC LIMIT 100",
      [tenant,user.id]);
    return send(res,200,{numbers:rows.rows});
  }
  if (path === "/api/inhouse/reserve" && req.method === "POST") {
    if (!user.features.billing) return send(res,403,{error:"Billing unavailable"});
    const {number} = await readJson(req);
    if (!validInhouseDid(number)) return send(res,400,{error:"Valid E.164 number required"});
    const db=await pool.connect();
    try {
      await db.query("BEGIN");
      const found=await db.query("SELECT id,status,setup_cents,monthly_cents FROM inhouse_dids WHERE tenant_id=$1 AND number_e164=$2 FOR UPDATE",[tenant,number]);
      const did=found.rows[0];
      if (!did || did.status !== "available") {
        await db.query("ROLLBACK");
        return send(res,409,{error:"Number unavailable"});
      }
      const invoiceId=randomUUID();
      await db.query("INSERT INTO invoices(id,user_id,description,amount_cents) VALUES($1,$2,$3,$4)",
        [invoiceId,user.id,"In-house DID setup request "+number,did.setup_cents]);
      await db.query("UPDATE inhouse_dids SET status='reserved',user_id=$1,invoice_id=$2,reserved_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR) WHERE id=$3",
        [user.id,invoiceId,did.id]);
      await db.query("COMMIT");
      return send(res,201,{number,status:"reserved",invoiceId,expiresInHours:24,monthlyCents:did.monthly_cents,provisioned:false});
    } catch(error) { await db.query("ROLLBACK"); throw error; }
    finally {db.release();}
  }
  if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
  if (path === "/api/admin/inhouse/blocks" && req.method === "GET") {
    const result=await pool.query("SELECT prefix_digits,requested_count,status,note FROM did_requested_blocks WHERE tenant_id=$1 ORDER BY prefix_digits",[tenant]);
    return send(res,200,{blocks:result.rows});
  }
  const blockAction=/^\/api\/admin\/inhouse\/blocks\/(20315[0-4])\/(import|publish-range)$/.exec(path);
  if (blockAction && req.method === "POST") {
    const [,prefix,operation]=blockAction;
    const data=await readJson(req);
    if (operation==="import" && (!validPrice(data.setupCents) || !validPrice(data.monthlyCents)))
      return send(res,400,{error:"Valid setup and monthly prices in cents required"});
    if (operation==="publish-range" && (data.confirmed!==true || !Number.isInteger(data.startSuffix) ||
        !Number.isInteger(data.endSuffix) || data.startSuffix<0 || data.endSuffix>9999 ||
        data.startSuffix>data.endSuffix || typeof data.inventoryReference!=="string" ||
        !data.inventoryReference.trim() || data.inventoryReference.length>255))
      return send(res,400,{error:"Confirm verified unused suffix range and provide inventory reference"});
    const db=await pool.connect();
    try {
      await db.query("BEGIN");
      const block=(await db.query("SELECT status FROM did_requested_blocks WHERE tenant_id=$1 AND prefix_digits=$2 FOR UPDATE",[tenant,prefix])).rows[0];
      if (!block) {await db.query("ROLLBACK");return send(res,404,{error:"Block unavailable"});}
      if (operation==="import") {
        if (block.status!=="allocated_ncc") {await db.query("ROLLBACK");return send(res,409,{error:"Block already imported or unavailable"});}
        let imported=0;
        for (let start=0;start<10000;start+=250) {
          const values=[],params=[];
          for (let suffix=start;suffix<start+250;suffix++) {
            const offset=params.length;
            values.push(`($${offset+1},$${offset+2},$${offset+3},$${offset+4},$${offset+5},$${offset+6})`);
            params.push(randomUUID(),tenant,nigeriaBlockNumber(prefix,suffix),data.setupCents,data.monthlyCents,
              "NCC National Numbering Plan allocation to Smooth Multi-Service Platform Limited");
          }
          const result=await db.query(`INSERT IGNORE INTO inhouse_dids(id,tenant_id,number_e164,setup_cents,monthly_cents,evidence_reference) VALUES ${values.join(",")}`,params);
          imported+=result.rowCount;
        }
        await db.query("UPDATE did_requested_blocks SET status='imported_unverified' WHERE tenant_id=$1 AND prefix_digits=$2",[tenant,prefix]);
        await db.query("COMMIT");
        return send(res,201,{prefix,imported,status:"imported_unverified",provisioned:false});
      }
      if (block.status!=="imported_unverified") {await db.query("ROLLBACK");return send(res,409,{error:"Import block first"});}
      const result=await db.query("UPDATE inhouse_dids SET status='available',evidence_reference=$1 WHERE tenant_id=$2 AND number_e164 BETWEEN $3 AND $4 AND status='unverified'",
        [data.inventoryReference.trim(),tenant,nigeriaBlockNumber(prefix,data.startSuffix),nigeriaBlockNumber(prefix,data.endSuffix)]);
      await db.query("COMMIT");
      return send(res,200,{prefix,published:result.rowCount,provisioned:false});
    } catch(error) {await db.query("ROLLBACK");throw error;}
    finally {db.release();}
  }
  if (path === "/api/admin/inhouse/numbers" && req.method === "GET") {
    const result=await pool.query("SELECT id,number_e164,status,setup_cents,monthly_cents,evidence_reference,user_id,invoice_id,reserved_until FROM inhouse_dids WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200",[tenant]);
    return send(res,200,{numbers:result.rows});
  }
  if (path === "/api/admin/inhouse/numbers" && req.method === "POST") {
    const {number,setupCents,monthlyCents,evidenceReference} = await readJson(req);
    if (!validInhouseDid(number) || !Number.isSafeInteger(setupCents) ||
        !Number.isSafeInteger(monthlyCents) || setupCents<0 || setupCents>10000000 ||
        monthlyCents<0 || monthlyCents>10000000 ||
        typeof evidenceReference !== "string" || !evidenceReference.trim() ||
        evidenceReference.length>255)
      return send(res,400,{error:"Valid DID, prices in cents, and numbering-rights reference required"});
    const id=randomUUID();
    try {
      await pool.query("INSERT INTO inhouse_dids(id,tenant_id,number_e164,setup_cents,monthly_cents,evidence_reference) VALUES($1,$2,$3,$4,$5,$6)",
        [id,tenant,number,setupCents,monthlyCents,evidenceReference.trim()]);
    } catch(error) {
      if (error.code==="ER_DUP_ENTRY") return send(res,409,{error:"Number already in inventory"});
      throw error;
    }
    return send(res,201,{id,number,status:"unverified"});
  }
  const action=/^\/api\/admin\/inhouse\/numbers\/([0-9a-f-]{36})\/(publish|disable|release)$/i.exec(path);
  if (action && req.method === "POST") {
    const [,id,operation]=action;
    const db=await pool.connect();
    try {
      await db.query("BEGIN");
      const result=await db.query("SELECT status,invoice_id,reserved_until FROM inhouse_dids WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[id,tenant]);
      const did=result.rows[0];
      if (!did) { await db.query("ROLLBACK"); return send(res,404,{error:"Number unavailable"}); }
      if (operation==="publish" && did.status==="unverified") {
        const {confirmed} = await readJson(req);
        if (confirmed !== true) { await db.query("ROLLBACK"); return send(res,400,{error:"Confirm numbering rights before publishing"}); }
        await db.query("UPDATE inhouse_dids SET status='available' WHERE id=$1",[id]);
      } else if (operation==="disable" && did.status==="available") {
        await db.query("UPDATE inhouse_dids SET status='disabled' WHERE id=$1",[id]);
      } else if (operation==="release" && did.status==="reserved" && new Date(did.reserved_until).getTime()<=Date.now()) {
        await db.query("UPDATE invoices SET status='void' WHERE id=$1 AND status='unpaid'",[did.invoice_id]);
        await db.query("UPDATE inhouse_dids SET status='available',user_id=NULL,invoice_id=NULL,reserved_until=NULL WHERE id=$1",[id]);
      } else { await db.query("ROLLBACK"); return send(res,409,{error:"Invalid number state or reservation not expired"}); }
      await db.query("COMMIT");
      return send(res,200,{status:operation==="publish"?"available":operation==="disable"?"disabled":"available",provisioned:false});
    } catch(error) {await db.query("ROLLBACK");throw error;}
    finally {db.release();}
  }
  return send(res,404,{error:"In-house DID route unavailable"});
}
