const e164=/^\+?[1-9][0-9]{7,14}$/;
export function inboundNumber(value){return typeof value==='string'&&e164.test(value)?'+'+value.replace(/^\+/,''):null;}
export async function lookupInboundDidOwner(pool,tenant,number){
 const normalized=inboundNumber(number);if(!normalized)return null;
 // Current assignments take priority over historic fulfilled quotes.
 // Never normalize by suffix, prefix, profile phone, or caller ID.
 const current=await pool.query(`SELECT DISTINCT a.user_id,u.status AS user_status,t.status AS tenant_status FROM (
 SELECT user_id FROM flowroute_sms_numbers WHERE tenant_id=$1 AND number_e164 IN ($2,SUBSTRING($2,2)) AND enabled=TRUE
 UNION SELECT user_id FROM inhouse_dids WHERE tenant_id=$1 AND number_e164 IN ($2,SUBSTRING($2,2)) AND status='assigned' AND user_id IS NOT NULL
 UNION SELECT user_id FROM did_shop_orders WHERE tenant_id=$1 AND number_e164 IN ($2,SUBSTRING($2,2)) AND status='active' AND rental_until>UTC_TIMESTAMP(3)
 ) a LEFT JOIN users u ON u.id=a.user_id AND u.tenant_id=$1
 LEFT JOIN tenants t ON t.id=u.tenant_id LIMIT 2`,[tenant,normalized]);
 if(current.rows.length){const row=current.rows[0];return current.rows.length===1&&row.user_status==='active'&&row.tenant_status==='active'?{user_id:row.user_id}:null;}
 // Compatibility for older deployments that provisioned directly from a quote.
 // A DID with any current assignment, including inactive or expired assignments, cannot fall back.
 const assigned=await pool.query(`SELECT 1 FROM (
 SELECT user_id FROM flowroute_sms_numbers WHERE tenant_id=$1 AND number_e164 IN ($2,SUBSTRING($2,2))
 UNION SELECT user_id FROM inhouse_dids WHERE tenant_id=$1 AND number_e164 IN ($2,SUBSTRING($2,2))
 UNION SELECT user_id FROM did_shop_orders WHERE tenant_id=$1 AND number_e164 IN ($2,SUBSTRING($2,2))
 ) a LIMIT 1`,[tenant,normalized]);
 if(assigned.rows.length)return null;
 const legacy=await pool.query(`SELECT DISTINCT u.id AS user_id FROM did_quotes q
 JOIN users u ON u.id=q.user_id AND u.tenant_id=$1 AND u.status='active'
 JOIN tenants t ON t.id=u.tenant_id AND t.status='active'
 WHERE q.provider='flowroute' AND q.number_e164 IN ($2,SUBSTRING($2,2)) AND q.status='fulfilled' LIMIT 2`,[tenant,normalized]);
 return legacy.rows.length===1?legacy.rows[0]:null;
}
export function uniqueInboundSip(rows){
 if(rows.length!==1)return null;
 const sip=rows[0];return /^[a-z0-9+_.-]{1,64}$/i.test(sip.username||'')&&/^[a-z0-9.-]{1,253}$/i.test(sip.domain||'')?sip:null;
}
