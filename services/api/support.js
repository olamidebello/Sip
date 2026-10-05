import {randomUUID} from "node:crypto";
import {isAdmin} from "./tenancy.js";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses=["open","in_progress","waiting_on_user","resolved","closed"];
const priorities=["low","normal","high","urgent"];
const categories=["account","billing","calling","numbers","technical","other"];
export function cleanSearch(value) {
  if(typeof value!=="string" || value.trim().length<2 || value.length>100) throw new RangeError("Search needs 2 to 100 characters");
  return `%${value.trim().replace(/[!%_]/g,"!$&")}%`;
}
function text(value,max) {return typeof value==="string" && value.trim().length>0 && value.length<=max ? value.trim() : null;}
export async function migrateSupport(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS support_tickets (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,requester_id CHAR(36) NOT NULL,
    assignee_id CHAR(36) NULL,subject VARCHAR(160) NOT NULL,description TEXT NOT NULL,
    category VARCHAR(24) NOT NULL,priority VARCHAR(16) NOT NULL DEFAULT 'normal',
    status VARCHAR(24) NOT NULL DEFAULT 'open',created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(requester_id) REFERENCES users(id),
    FOREIGN KEY(assignee_id) REFERENCES users(id),INDEX support_tenant_list(tenant_id,status,updated_at),
    INDEX support_requester(requester_id,updated_at)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS support_replies (
    id CHAR(36) PRIMARY KEY,ticket_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,
    author_id CHAR(36) NOT NULL,body TEXT NOT NULL,internal_note BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY(author_id) REFERENCES users(id),INDEX support_replies_ticket(ticket_id,created_at)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS support_events (
    id CHAR(36) PRIMARY KEY,ticket_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,
    actor_id CHAR(36) NOT NULL,old_status VARCHAR(24) NOT NULL,new_status VARCHAR(24) NOT NULL,
    old_priority VARCHAR(16) NOT NULL,new_priority VARCHAR(16) NOT NULL,
    old_assignee_id CHAR(36) NULL,new_assignee_id CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY(actor_id) REFERENCES users(id),INDEX support_events_ticket(ticket_id,created_at)) ENGINE=InnoDB`);
}
export async function handleSupport({req,res,path,user,pool,send,readJson}) {
  const admin=isAdmin(user),url=new URL(req.url,"http://localhost");
  if(path==="/api/support/tickets" && req.method==="GET") {
    const {searchParams:p}=url,status=p.get("status"),priority=p.get("priority"),page=Number(p.get("page")||1);
    if((status && !statuses.includes(status)) || (priority && !priorities.includes(priority)) ||
       !Number.isInteger(page) || page<1 || page>100) return send(res,400,{error:"Invalid ticket filter"});
    let pattern=null;
    if(p.has("q")) try{pattern=cleanSearch(p.get("q"));}catch(error){return send(res,400,{error:error.message});}
    const params=[user.tenant_id],clauses=["t.tenant_id=$1"];
    if(!admin){params.push(user.id);clauses.push(`t.requester_id=$${params.length}`);}
    if(status){params.push(status);clauses.push(`t.status=$${params.length}`);}
    if(priority){params.push(priority);clauses.push(`t.priority=$${params.length}`);}
    if(pattern){params.push(pattern,pattern);clauses.push(`(t.subject LIKE $${params.length-1} ESCAPE '!' OR t.description LIKE $${params.length} ESCAPE '!')`);}
    const where=clauses.join(" AND ");params.push((page-1)*25);
    const result=await pool.query(`SELECT t.id,t.subject,t.category,t.priority,t.status,t.requester_id,t.assignee_id,t.created_at,t.updated_at,
      u.display_name AS requester_name,a.display_name AS assignee_name FROM support_tickets t
      JOIN users u ON u.id=t.requester_id LEFT JOIN users a ON a.id=t.assignee_id
      WHERE ${where} ORDER BY t.updated_at DESC,t.id DESC LIMIT 26 OFFSET $${params.length}`,params);
    return send(res,200,{tickets:result.rows.slice(0,25),hasMore:result.rows.length>25,page});
  }
  if(path==="/api/support/tickets" && req.method==="POST") {
    const data=await readJson(req),subject=text(data.subject,160),description=text(data.description,4000);
    if(!subject || !description || !categories.includes(data.category)) return send(res,400,{error:"Subject, category and description required"});
    const id=randomUUID();
    await pool.query("INSERT INTO support_tickets(id,tenant_id,requester_id,subject,description,category) VALUES($1,$2,$3,$4,$5,$6)",
      [id,user.tenant_id,user.id,subject,description,data.category]);
    return send(res,201,{id,status:"open"});
  }
  const match=/^\/api\/support\/tickets\/([0-9a-f-]{36})(?:\/(replies|manage))?$/i.exec(path);
  if(!match || !uuid.test(match[1])) return send(res,404,{error:"Ticket route unavailable"});
  const id=match[1],result=await pool.query("SELECT * FROM support_tickets WHERE id=$1 AND tenant_id=$2",[id,user.tenant_id]);
  const ticket=result.rows[0];
  if(!ticket || (!admin && ticket.requester_id!==user.id)) return send(res,404,{error:"Ticket unavailable"});
  if(!match[2] && req.method==="GET") {
    const [replies,history]=await Promise.all([
      pool.query(`SELECT r.id,r.body,r.internal_note,r.created_at,r.author_id,u.display_name AS author_name
      FROM support_replies r JOIN users u ON u.id=r.author_id WHERE r.ticket_id=$1 AND r.tenant_id=$2
      ${admin?"":"AND r.internal_note=FALSE"} ORDER BY r.created_at,r.id LIMIT 500`,[id,user.tenant_id]),
      pool.query(`SELECT e.old_status,e.new_status,e.old_priority,e.new_priority,e.created_at,u.display_name AS actor_name
        FROM support_events e JOIN users u ON u.id=e.actor_id WHERE e.ticket_id=$1 AND e.tenant_id=$2
        ORDER BY e.created_at,e.id LIMIT 500`,[id,user.tenant_id])]);
    return send(res,200,{ticket,replies:replies.rows,history:history.rows});
  }
  if(match[2]==="replies" && req.method==="POST") {
    const data=await readJson(req),body=text(data.body,4000),internal=data.internalNote===true;
    if(!body || (data.internalNote!==undefined && typeof data.internalNote!=="boolean") || (internal && !admin))
      return send(res,400,{error:"Valid reply and note permission required"});
    if(ticket.status==="closed") return send(res,409,{error:"Reopen ticket before replying"});
    await pool.query("INSERT INTO support_replies(id,ticket_id,tenant_id,author_id,body,internal_note) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(),id,user.tenant_id,user.id,body,internal]);
    await pool.query("UPDATE support_tickets SET updated_at=UTC_TIMESTAMP(3) WHERE id=$1 AND tenant_id=$2",[id,user.tenant_id]);
    return send(res,201,{status:"posted"});
  }
  if(match[2]==="manage" && req.method==="PUT") {
    if(!admin) return send(res,403,{error:"Administrator required"});
    const data=await readJson(req);
    if(!statuses.includes(data.status) || !priorities.includes(data.priority) ||
       (data.assigneeId!==null && !uuid.test(data.assigneeId||""))) return send(res,400,{error:"Valid status, priority and assignee required"});
    if(data.assigneeId) {
      const target=await pool.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active' AND role IN ('admin','super_admin')",
        [data.assigneeId,user.tenant_id]);
      if(!target.rowCount) return send(res,404,{error:"Tenant administrator unavailable"});
    }
    const db=await pool.connect();
    try {
      await db.query("BEGIN");
      const locked=await db.query("SELECT status,priority,assignee_id FROM support_tickets WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[id,user.tenant_id]);
      if(!locked.rowCount){await db.query("ROLLBACK");return send(res,404,{error:"Ticket unavailable"});}
      const previous=locked.rows[0];
      await db.query("UPDATE support_tickets SET status=$1,priority=$2,assignee_id=$3 WHERE id=$4 AND tenant_id=$5",
        [data.status,data.priority,data.assigneeId,id,user.tenant_id]);
      await db.query(`INSERT INTO support_events(id,ticket_id,tenant_id,actor_id,old_status,new_status,old_priority,new_priority,old_assignee_id,new_assignee_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [randomUUID(),id,user.tenant_id,user.id,previous.status,data.status,previous.priority,data.priority,
          previous.assignee_id,data.assigneeId]);
      await db.query("COMMIT");
    }catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}
    return send(res,200,{status:data.status,priority:data.priority,assigneeId:data.assigneeId});
  }
  return send(res,404,{error:"Ticket action unavailable"});
}
