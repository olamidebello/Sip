export function describeCall(row,now){
 const started=Number(row.answered_epoch)||null;
 const created=Number(row.age_seconds)||0;
 const age=started?Math.max(0,Math.floor(now/1000)-started):Math.max(0,created);
 const stale=age>(started?Number(row.max_seconds)+30:120);
 return {id:row.call_key,user:row.display_name||'User',caller:row.caller_id||'',destination:row.destination,provider:row.provider,state:stale?'uncertain':started?'connected':'connecting',durationSeconds:started?age:0,ageSeconds:age,maxSeconds:Number(row.max_seconds)};
}
export async function handleLiveCalls({req,res,user,pool,send}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method!=='GET')return send(res,405,{error:'GET required'});
 const now=Date.now();
 const result=await pool.query(`SELECT c.call_key,c.caller_id,c.destination,c.provider,c.max_seconds,c.answered_epoch,
 TIMESTAMPDIFF(SECOND,c.created_at,UTC_TIMESTAMP(3)) AS age_seconds,u.display_name
 FROM pstn_calls c JOIN users u ON u.id=c.user_id AND u.tenant_id=c.tenant_id
 WHERE c.tenant_id=$1 AND c.status<>'settled'
 ORDER BY c.created_at DESC LIMIT 501`,[user.tenant_id]);
 const calls=result.rows.slice(0,500).map(row=>describeCall(row,now));
 res.setHeader('Cache-Control','no-store');
 return send(res,200,{updatedAt:new Date(now).toISOString(),scope:'Outbound carrier calls in your workspace. Switch billing events; internal and inbound calls are not included.',truncated:result.rows.length>500,calls,counts:{connected:calls.filter(c=>c.state==='connected').length,connecting:calls.filter(c=>c.state==='connecting').length,uncertain:calls.filter(c=>c.state==='uncertain').length}});
}
