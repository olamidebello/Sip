const valid=id=>/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id);
export async function googleContactsConfig(pool,tenant){
 const row=(await pool.query("SELECT value FROM tenant_settings WHERE tenant_id=$1 AND setting_key='google_contacts_oauth'",[tenant])).rows[0];
 if(row){try{const setting=JSON.parse(row.value);return {configured:!!setting.enabled&&valid(setting.clientId||''),clientId:setting.clientId||null,enabled:!!setting.enabled,source:'database'};}catch{return {configured:false,clientId:null,enabled:false,source:'database'};}}
 const clientId=process.env.GOOGLE_CONTACTS_CLIENT_ID||'';return {configured:valid(clientId),clientId:valid(clientId)?clientId:null,enabled:valid(clientId),source:'environment'};
}
export async function handleGoogleContactsAdmin({req,res,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method==='GET')return send(res,200,{...await googleContactsConfig(pool,user.tenant_id),tenantId:user.tenant_id});
 if(req.method!=='PUT')return send(res,405,{error:'GET or PUT required'});
 const body=await readJson(req),clientId=typeof body.clientId==='string'?body.clientId.trim():'';
 if(typeof body.enabled!=='boolean'||clientId.length>254||(clientId&&!valid(clientId))||(body.enabled&&!valid(clientId)))return send(res,400,{error:'Valid Google OAuth client ID and enabled flag required'});
 await pool.query("INSERT INTO tenant_settings(tenant_id,setting_key,value) VALUES($1,'google_contacts_oauth',$2) ON DUPLICATE KEY UPDATE value=$2",[user.tenant_id,JSON.stringify({clientId,enabled:body.enabled})]);
 return send(res,200,{configured:body.enabled&&valid(clientId),clientId:clientId||null,enabled:body.enabled,source:'database',tenantId:user.tenant_id});
}
