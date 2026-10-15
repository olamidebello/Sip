import {reportRange} from './reports.js';
export async function countryReport(pool,tenant,range){
 const rows=(await pool.query(`SELECT COALESCE(JSON_UNQUOTE(p.data->'$.country'),'Unclassified') AS country,COUNT(*) AS calls,COALESCE(SUM(GREATEST(0,c.ended_epoch-c.answered_epoch)),0) AS seconds,COALESCE(SUM(c.charged_cents),0) AS charged_cents FROM pstn_calls c LEFT JOIN telecom_policies p ON p.id=(SELECT p2.id FROM telecom_policies p2 WHERE p2.tenant_id=c.tenant_id AND p2.kind='country-prefixes' AND p2.enabled=TRUE AND c.destination LIKE CONCAT(JSON_UNQUOTE(p2.data->'$.prefix'),'%') ORDER BY CHAR_LENGTH(JSON_UNQUOTE(p2.data->'$.prefix')) DESC,p2.id LIMIT 1) WHERE c.tenant_id=$1 AND c.status='settled' AND c.settled_at >= $2 AND c.settled_at < $3 GROUP BY COALESCE(JSON_UNQUOTE(p.data->'$.country'),'Unclassified') ORDER BY charged_cents DESC,country`,[tenant,range.from,range.until])).rows;
 return {rows,period:range,currency:'USD',note:'Settled paid-call records classified by configured longest destination prefix. Unknown destinations remain Unclassified. Failed calls are included with zero charge.'};
}
export async function handleTelecomAnalytics({req,res,path,user,pool,send}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method!=='GET')return send(res,405,{error:'GET required'});
 let range;try{range=reportRange(new URL(req.url||path,'http://localhost').searchParams);}catch(e){return send(res,400,{error:e.message});}
 const kind=path.slice('/api/admin/telecom/analytics/'.length);
 if(kind==='countries')return send(res,200,await countryReport(pool,user.tenant_id,range));
 if(kind==='call-types'){const rows=(await pool.query("SELECT COALESCE(t.name,'Unclassified') AS call_type,COUNT(*) AS calls,COALESCE(SUM(c.charged_cents),0) AS charged_cents FROM pstn_calls c LEFT JOIN telecom_tariff_catalog t ON t.id=c.call_type_id AND t.tenant_id=c.tenant_id WHERE c.tenant_id=$1 AND c.status='settled' AND c.settled_at >= $2 AND c.settled_at < $3 GROUP BY COALESCE(t.name,'Unclassified') ORDER BY charged_cents DESC",[user.tenant_id,range.from,range.until])).rows;return send(res,200,{rows,currency:'USD',period:range});}
 if(kind==='shadow'){
  const rows=(await pool.query('SELECT call_key,user_id,policy_id,actual_cents,shadow_cents,shadow_cents-actual_cents AS difference_cents,seconds,created_at FROM telecom_shadow_ledger WHERE tenant_id=$1 AND created_at >= $2 AND created_at < $3 ORDER BY created_at DESC,call_key LIMIT 500',[user.tenant_id,range.from,range.until])).rows;
  return send(res,200,{rows,period:range,currency:'USD',note:'Independent comparison ledger; shadow amounts never change wallets. Latest 500 records in selected period.'});
 }
 return send(res,404,{error:'Unknown analytics report'});
}
