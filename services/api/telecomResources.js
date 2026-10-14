import {isAdmin} from './tenancy.js';
// Explicit projections exclude passwords, tokens and provider secrets.
const resources={
 invoices:{sql:'SELECT i.id,i.user_id,i.description,i.amount_cents,i.currency,i.status,i.created_at FROM invoices i JOIN users u ON u.id=i.user_id WHERE u.tenant_id=$1 ORDER BY i.created_at DESC,i.id',note:'Invoice records; paid status alone does not verify provider settlement.'},
 charges:{sql:'SELECT call_key,user_id,destination,provider,status,rate,reserved_cents,charged_cents,created_at,settled_at FROM pstn_calls WHERE tenant_id=$1 ORDER BY created_at DESC,call_key',note:'Switch-integrated PSTN charging records. Reserved amounts are not settled charges.'},
 audit:{sql:'SELECT id,actor_id,target_id,action,created_at FROM security_events WHERE tenant_id=$1 ORDER BY created_at DESC,id',note:'Recorded security and administrative events.'},
 'low-balances':{sql:'SELECT w.user_id,u.display_name,w.currency,w.balance_cents,w.updated_at FROM wallet_accounts w JOIN users u ON u.id=w.user_id AND u.tenant_id=w.tenant_id WHERE w.tenant_id=$1 AND w.balance_cents <= $2 ORDER BY w.balance_cents,w.user_id',threshold:true,note:'Current wallet balances in currency minor units; currencies are not combined.'}
};
export async function handleTelecomResources({req,res,path,user,pool,send}){
 if(!isAdmin(user))return send(res,403,{error:'Administrator required'});
 if(req.method!=='GET')return send(res,405,{error:'GET required; use the related working controls for changes'});
 const kind=path.slice('/api/admin/telecom/resources/'.length),resource=resources[kind];
 if(!resource)return send(res,404,{error:'Unknown telecom resource'});
 const query=new URL(req.url||path,'http://localhost').searchParams;
 const integer=(name,fallback,max)=>{const raw=query.get(name);if(raw===null)return fallback;if(!/^\d+$/.test(raw))return null;const n=Number(raw);return Number.isSafeInteger(n)&&n<=max?n:null;};
 const limit=integer('limit',100,200),offset=integer('offset',0,100000),threshold=integer('thresholdCents',1000,100000000);
 if(limit===null||limit<1||offset===null||threshold===null)return send(res,400,{error:'Invalid pagination or balance threshold'});
 const params=[user.tenant_id];if(resource.threshold)params.push(threshold);
 const rows=(await pool.query(resource.sql+' LIMIT $'+(params.length+1)+' OFFSET $'+(params.length+2),[...params,limit,offset])).rows;
 return send(res,200,{resource:kind,rows,limit,offset,thresholdCents:resource.threshold?threshold:undefined,note:resource.note});
}
