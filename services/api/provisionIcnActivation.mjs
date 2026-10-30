import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function provisionIcn(rows,existing={}){
 const eligible=rows.filter(r=>Number(r.purchased)===1&&Number(r.tenant_active)===1&&Number(r.user_active)===1).sort((a,b)=>a.number_e164.localeCompare(b.number_e164));
 const tenants=[...new Set(eligible.map(r=>r.tenant_id))];const preferred={};
 for(const r of eligible)if(!preferred[r.user_id])preferred[r.user_id]=r.number_e164;
 const defaults={version:1,enabled:true,carrierApproved:false,approvalReference:'',callerIdFormat:'unconfirmed',firstInterval:60,nextInterval:60,maxSeconds:3600,maxConcurrent:1,tenants,preferredDids:preferred,prefixes:[]};
 // Preserve explicitly saved carrier, scope, tariff and preferred-number settings.
 const config={...defaults,...existing,preferredDids:{...preferred,...existing.preferredDids}};
 if(!Array.isArray(existing.tenants)||!existing.tenants.length)config.tenants=tenants;
 const missing=[];
 if(config.carrierApproved!==true||!config.approvalReference?.trim())missing.push('carrier_approval');
 if(!['domestic','e164-digits','e164-plus'].includes(config.callerIdFormat))missing.push('carrier_caller_id_format');
 if(!config.tenants.length)missing.push('active_subscriber_assignment');
 if(!Array.isArray(config.prefixes)||!config.prefixes.length)missing.push('reviewed_tariff_prefixes');
 return {icn_activation:config,provisioning:{activePaidDids:eligible.length,missing}};
}
async function main(){
 const {createDatabase}=await import('/app/db.js');const db=createDatabase(process.env.MYSQL_URL);
 try{
  const input=fs.readFileSync(0,'utf8').trim(),saved=input?JSON.parse(input):{};
  const rows=(await db.query("SELECT d.number_e164,r.user_id,r.tenant_id,(t.status='active') AS tenant_active,(u.status='active') AS user_active,EXISTS(SELECT 1 FROM smooth_did_payments p JOIN invoices i ON i.id=p.invoice_id AND i.user_id=p.user_id AND i.status='paid' WHERE p.did_id=d.id AND p.tenant_id=r.tenant_id AND p.user_id=r.user_id AND p.period_end=r.paid_until) AS purchased FROM smooth_did_rentals r JOIN inhouse_dids d ON d.id=r.did_id AND d.tenant_id=r.tenant_id AND d.user_id=r.user_id JOIN users u ON u.id=r.user_id AND u.tenant_id=r.tenant_id JOIN tenants t ON t.id=r.tenant_id WHERE r.status='active' AND r.paid_until>UTC_TIMESTAMP(3) AND d.status='assigned' AND d.number_e164 LIKE '+234%' ORDER BY d.number_e164")).rows;
  const included=(await db.query("SELECT d.number_e164,f.user_id,f.tenant_id,1 AS tenant_active,1 AS user_active,1 AS purchased FROM inhouse_subscriber_assignments f JOIN inhouse_dids d ON d.id=f.did_id AND d.tenant_id=f.tenant_id AND d.user_id=f.user_id JOIN users u ON u.id=f.user_id AND u.tenant_id=f.tenant_id JOIN tenants t ON t.id=f.tenant_id WHERE d.status='assigned' AND u.status='active' AND t.status='active' AND EXISTS(SELECT 1 FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=f.user_id AND s.status='active' AND p.tenant_id=f.tenant_id AND p.active=TRUE)")).rows;
  const unique=[...new Map([...rows,...included].map(r=>[r.number_e164,r])).values()];
  process.stdout.write(JSON.stringify(provisionIcn(unique,saved.icn_activation||saved)));
 }finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('ICN_PROVISION failed; existing activation file unchanged');process.exitCode=1;});
