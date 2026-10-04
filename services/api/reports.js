import { isAdmin } from "./tenancy.js";

export function reportRange(search) {
  const today=new Date().toISOString().slice(0,10);
  const end=search.get("to") || today;
  const date=(value)=>/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
  if (!date(end)) throw new RangeError("Use valid YYYY-MM-DD dates");
  const from=search.get("from") || new Date(Date.parse(`${end}T00:00:00Z`)-29*86400000).toISOString().slice(0,10);
  if (!date(from)) throw new RangeError("Use valid YYYY-MM-DD dates");
  const span=(Date.parse(`${end}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86400000;
  if (span<0 || span>365) throw new RangeError("Date range must cover 1 to 366 days");
  return {from,to:end,until:new Date(Date.parse(`${end}T00:00:00Z`)+86400000).toISOString().slice(0,10)};
}

export async function collectReport(pool,tenant,{from,to,until}) {
  const [daily,dispositions,directions,sources,hours,invoices,inventory,ports,users,agents]=await Promise.all([
    pool.query("SELECT DATE_FORMAT(started_at,'%Y-%m-%d') AS day,COUNT(*) AS calls,COALESCE(SUM(disposition='answered'),0) AS answered,COALESCE(SUM(disposition='missed'),0) AS missed,COALESCE(SUM(duration_seconds),0) AS duration_seconds,COALESCE(SUM(billable_seconds),0) AS billable_seconds FROM cdr_records WHERE tenant_id=$1 AND started_at >= $2 AND started_at < $3 GROUP BY DATE_FORMAT(started_at,'%Y-%m-%d') ORDER BY day",[tenant,from,until]),
    pool.query("SELECT disposition,COUNT(*) AS calls FROM cdr_records WHERE tenant_id=$1 AND started_at >= $2 AND started_at < $3 GROUP BY disposition ORDER BY calls DESC",[tenant,from,until]),
    pool.query("SELECT direction,COUNT(*) AS calls FROM cdr_records WHERE tenant_id=$1 AND started_at >= $2 AND started_at < $3 GROUP BY direction ORDER BY calls DESC",[tenant,from,until]),
    pool.query("SELECT source,COUNT(*) AS calls,COALESCE(SUM(disposition='answered'),0) AS answered FROM cdr_records WHERE tenant_id=$1 AND started_at >= $2 AND started_at < $3 GROUP BY source ORDER BY calls DESC LIMIT 20",[tenant,from,until]),
    pool.query("SELECT HOUR(started_at) AS utc_hour,COUNT(*) AS calls FROM cdr_records WHERE tenant_id=$1 AND started_at >= $2 AND started_at < $3 GROUP BY HOUR(started_at) ORDER BY utc_hour",[tenant,from,until]),
    pool.query("SELECT i.currency,i.status,COUNT(*) AS invoices,COALESCE(SUM(i.amount_cents),0) AS amount_cents FROM invoices i JOIN users u ON u.id=i.user_id WHERE u.tenant_id=$1 AND i.created_at >= $2 AND i.created_at < $3 GROUP BY i.currency,i.status ORDER BY i.currency,i.status",[tenant,from,until]),
    pool.query("SELECT status,COUNT(*) AS numbers FROM inhouse_dids WHERE tenant_id=$1 GROUP BY status ORDER BY status",[tenant]),
    pool.query("SELECT p.status,COUNT(*) AS requests FROM port_requests p JOIN users u ON u.id=p.user_id WHERE u.tenant_id=$1 AND p.created_at >= $2 AND p.created_at < $3 GROUP BY p.status ORDER BY p.status",[tenant,from,until]),
    pool.query("SELECT COUNT(*) AS total,COALESCE(SUM(created_at >= $2 AND created_at < $3),0) AS new_users FROM users WHERE tenant_id=$1",[tenant,from,until]),
    pool.query("SELECT COALESCE(s.status,'offline') AS status,COUNT(*) AS agents FROM pbx_extensions e JOIN users u ON u.id=e.user_id LEFT JOIN pbx_agent_status s ON s.user_id=u.id WHERE e.tenant_id=$1 AND u.tenant_id=$1 GROUP BY COALESCE(s.status,'offline') ORDER BY status",[tenant])
  ]);
  const series=daily.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,key==="day"?value:Number(value)])));
  const total=series.reduce((acc,row)=>({calls:acc.calls+row.calls,answered:acc.answered+row.answered,
    missed:acc.missed+row.missed,durationSeconds:acc.durationSeconds+row.duration_seconds,
    billableSeconds:acc.billableSeconds+row.billable_seconds}),{calls:0,answered:0,missed:0,durationSeconds:0,billableSeconds:0});
  return {period:{from,to,timeZone:"UTC"},calls:{total,answerRatePercent:total.calls?Math.round(total.answered/total.calls*10000)/100:0,
    averageDurationSeconds:total.calls?Math.round(total.durationSeconds/total.calls):0,
    daily:series,dispositions:dispositions.rows,directions:directions.rows,sources:sources.rows,hours:hours.rows},
    billing:{invoices:invoices.rows},inventory:{inhouseDids:inventory.rows},
    porting:{requests:ports.rows},users:{total:Number(users.rows[0]?.total||0),new:Number(users.rows[0]?.new_users||0)},
    callCenter:{agentStatus:agents.rows},note:"CDR events are ingested records, not verified switch traffic. Invoices are recorded amounts, not payment settlement. Inventory and agent counts are current snapshots."};
}

export function reportCsv(report,kind="calls") {
  const rows=kind==="invoices" ?
    [["currency","status","invoices","amount_cents"],...report.billing.invoices.map(row=>[row.currency,row.status,row.invoices,row.amount_cents])] :
    [["day","calls","answered","missed","duration_seconds","billable_seconds"],
      ...report.calls.daily.map(row=>[row.day,row.calls,row.answered,row.missed,row.duration_seconds,row.billable_seconds])];
  return rows.map(row=>row.map(value=>{
    const cell=String(value);
    return `"${(/^[=+@\-\t\r]/.test(cell)?"'":"")+cell.replaceAll('"','""')}"`;
  }).join(",")).join("\r\n")+"\r\n";
}

export async function handleReports({req,res,user,pool,send}) {
  if (!isAdmin(user)) return send(res,403,{error:"Administrator required"});
  if (req.method!=="GET") return send(res,405,{error:"GET required"});
  const url=new URL(req.url,"http://localhost");
  let range;
  try {range=reportRange(url.searchParams);} catch(error) {
    if (error instanceof RangeError) return send(res,400,{error:error.message});
    throw error;
  }
  const report=await collectReport(pool,user.tenant_id,range);
  if (url.pathname.endsWith(".csv")) {
    const kind=url.searchParams.get("kind")||"calls";
    if (!["calls","invoices"].includes(kind)) return send(res,400,{error:"Unsupported export"});
    res.writeHead(200,{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="olamide-${kind}-${range.from}-${range.to}.csv"`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
    return res.end(reportCsv(report,kind));
  }
  return send(res,200,report);
}
