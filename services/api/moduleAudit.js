import fs from 'node:fs';
const audit=JSON.parse(fs.readFileSync(new URL('./data/module-audit.json',import.meta.url),'utf8'));
export async function handleModuleAudit({req,res,user,pool,send}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method!=='GET')return send(res,405,{error:'Read-only audit'});
 const rows=(await pool.query('SELECT component,applied_at FROM schema_components ORDER BY component')).rows;
 return send(res,200,{...audit,release:process.env.APP_RELEASE||null,appliedSchema:rows,serverInstallation:'unverified',note:'Source evidence is separate from installed schema and live service acceptance. Use per-node Kamailio audits for module loading evidence.'});
}
