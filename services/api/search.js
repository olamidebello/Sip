import {isAdmin} from "./tenancy.js";
import {cleanSearch} from "./support.js";

export async function handleSearch({req,res,user,pool,send}) {
  if(req.method!=="GET") return send(res,405,{error:"GET required"});
  const p=new URL(req.url,"http://localhost").searchParams,scope=p.get("scope")||"all";
  if(!["all","tickets","contacts","plans"].includes(scope)) return send(res,400,{error:"Invalid search category"});
  let term;
  try {term=cleanSearch(p.get("q"));}catch(error){return send(res,400,{error:error.message});}
  const admin=isAdmin(user),results={tickets:[],contacts:[],plans:[]},jobs=[];
  if(["all","tickets"].includes(scope)) jobs.push(pool.query(`SELECT id,subject,status,priority,updated_at FROM support_tickets
    WHERE tenant_id=$1 ${admin?"":"AND requester_id=$2"} AND (subject LIKE $${admin?2:3} ESCAPE '!' OR description LIKE $${admin?3:4} ESCAPE '!')
    ORDER BY updated_at DESC,id DESC LIMIT 20`,admin?[user.tenant_id,term,term]:[user.tenant_id,user.id,term,term])
    .then(result=>{results.tickets=result.rows;}));
  if(["all","contacts"].includes(scope) && user.features.messaging) jobs.push(pool.query(`SELECT u.id,u.display_name AS name,u.email
    FROM contacts c JOIN users u ON u.id=c.contact_id WHERE c.owner_id=$1 AND u.tenant_id=$2
    AND (u.display_name LIKE $3 ESCAPE '!' OR u.email LIKE $4 ESCAPE '!') ORDER BY u.display_name LIMIT 20`,
    [user.id,user.tenant_id,term,term]).then(result=>{results.contacts=result.rows;}));
  if(["all","plans"].includes(scope) && user.features.billing) jobs.push(pool.query(`SELECT id,name,description,monthly_cents FROM plans
    WHERE tenant_id=$1 AND active=TRUE AND (name LIKE $2 ESCAPE '!' OR description LIKE $3 ESCAPE '!') ORDER BY name LIMIT 20`,
    [user.tenant_id,term,term]).then(result=>{results.plans=result.rows;}));
  await Promise.all(jobs);
  return send(res,200,{results,limits:{perCategory:20},note:"Search covers visible app records only"});
}
