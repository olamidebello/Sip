export async function activeSubscription(pool,user) {
  const result=await pool.query(`SELECT 1 FROM subscriptions s JOIN plans p ON p.id=s.plan_id
    WHERE s.user_id=$1 AND s.status='active' AND p.tenant_id=$2 AND p.active=true`,[user.id,user.tenant_id]);
  return result.rowCount>0;
}
export function parseSipTarget(value) {
  const match=/^sip:([a-z0-9+_.-]{1,64})@([a-z0-9.-]{1,253})$/i.exec(value||'');
  return match?{username:match[1],domain:match[2].toLowerCase()}:null;
}
export async function callAccess(pool,user,target) {
  const address=parseSipTarget(target);
  if(!address)return {allowed:false,error:'Enter a valid SIP address'};
  const internal=await pool.query(`SELECT a.user_id,a.tenant_id FROM sip_accounts a
    JOIN users u ON u.id=a.user_id AND u.tenant_id=a.tenant_id JOIN tenants t ON t.id=a.tenant_id
    WHERE a.username=$1 AND a.domain=$2 AND a.status='active' AND u.status='active' AND t.status='active'`,[address.username,address.domain]);
  if(internal.rowCount) return internal.rows[0].tenant_id===user.tenant_id?
    {allowed:true,scope:'internal'}:{allowed:false,error:'Calls to another workspace are unavailable'};
  // Never send an unknown local identity to a carrier route.
  const local=await pool.query('SELECT 1 FROM sip_accounts WHERE domain=$1 LIMIT 1',[address.domain]);
  if(local.rowCount && !/^\+?[1-9][0-9]{6,14}$/.test(address.username))return {allowed:false,error:'This SIP user is unavailable'};
  return await activeSubscription(pool,user)?{allowed:true,scope:'external'}:
    {allowed:false,error:'An active subscription is required for external calls',configurationUrl:'/#billing'};
}
export async function handleCallAccess({req,res,path,user,pool,send,readJson}) {
  if(path==='/api/softphone/access'&&req.method==='GET') {
    const external=await activeSubscription(pool,user);
    return send(res,200,{internalCalls:true,externalCalls:external,scope:external?'subscribed':'internal_only',configurationUrl:'/#billing'});
  }
  if(path==='/api/softphone/authorize'&&req.method==='POST') {
    const {target}=await readJson(req),result=await callAccess(pool,user,target);
    return send(res,result.allowed?200:403,result);
  }
  return send(res,404,{error:'Call access route unavailable'});
}
