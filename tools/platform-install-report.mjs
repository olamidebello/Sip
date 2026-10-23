import fs from 'node:fs';

export function summarize(features) {
 if(!Array.isArray(features)||features.some(f=>!f.id||!f.name||!['implemented','partial','external_dependency','not_implemented'].includes(f.implementation)))throw Error('Unrecognized feature catalog; review required');
 const counts={};for(const f of features)counts[f.implementation]=(counts[f.implementation]||0)+1;
 return {total:features.length,counts,features:features.map(({id,name,group,implementation,detail})=>({id,name,group,implementation,detail,liveAcceptance:'unverified'})),outstanding:features.filter(f=>f.implementation!=='implemented').map(f=>f.id)};
}

export async function report(db,root='/app') {
 const catalog=JSON.parse(fs.readFileSync(root+'/telecomFeatureCatalog.json','utf8'));
 const [tables,components]=await Promise.all([db.query('SHOW TABLES'),db.query('SELECT component,applied_at FROM schema_components ORDER BY component')]);
 const required=['users','tenants','sessions','wallet_accounts','pstn_calls','caller_verification_settings','twilio_hub_settings','twilio_hub_jobs'];
 const names=new Set(tables.rows.flatMap(row=>Object.values(row)));
 return {generatedAt:new Date().toISOString(),scope:'Installed source and database evidence; not live acceptance',catalog:summarize(catalog),schema:{tableCount:names.size,requiredTables:required.map(name=>({name,present:names.has(name)})),components:components.rows},modules:Object.fromEntries(['twilioHub.js','twilioRoles.js','twilioAccountAuth.js','twilioReadiness.js','didAvailability.js','smoothDid.js','geoCalling.js','providerManager.js'].map(name=>[name,fs.existsSync(root+'/'+name)])),credentials:'Provision and test later in super-admin Providers & Routing > Twilio',allFeaturesComplete:false,live:false};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const {createDatabase}=await import('/app/db.js');const db=createDatabase(process.env.MYSQL_URL);try{console.log(JSON.stringify(await report(db),null,2));}finally{await db.end();}}
