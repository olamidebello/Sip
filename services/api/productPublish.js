import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createDatabase} from './db.js';
import {referenceProducts} from './productStore.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function publishReferenceProducts(pool,{tenantId,terms,check=false,publishArchived=false}){
 if(!uuid.test(tenantId||'')||typeof terms!=='string'||terms.trim().length<20||terms.length>4000)throw Error('Active tenant UUID and publication terms (20–4000 characters) required');
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const tenant=(await db.query("SELECT id FROM tenants WHERE id=$1 AND status='active' FOR UPDATE",[tenantId])).rows[0];
  if(!tenant)throw Error('Active tenant not found');
  const actor=(await db.query("SELECT id FROM users WHERE tenant_id=$1 AND status='active' AND role IN ('admin','super_admin') ORDER BY CASE WHEN role='super_admin' THEN 0 ELSE 1 END,id LIMIT 1",[tenantId])).rows[0];
  if(!actor)throw Error('Tenant must have an active administrator');
  const current=await db.query('SELECT sku,status,terms FROM store_products WHERE tenant_id=$1 FOR UPDATE',[tenantId]);
  const known=new Set(referenceProducts.map(p=>p.sku)),existing=new Map(current.rows.filter(p=>known.has(p.sku)).map(p=>[p.sku,p]));
  const missing=referenceProducts.filter(p=>!existing.has(p.sku));
  const changing=referenceProducts.filter(p=>{const row=existing.get(p.sku);return !row||((publishArchived||row.status!=='archived')&&(row.status!=='published'||row.terms.trim().length<20));});
  const report={tenantId,referenceCount:referenceProducts.length,imported:missing.length,published:changing.length,skippedArchived:current.rows.filter(p=>known.has(p.sku)&&p.status==='archived'&&!publishArchived).length,changed:!!changing.length,check};
  if(check){await db.query('ROLLBACK');return report;}
  for(const p of missing)await db.query(`INSERT INTO store_products(tenant_id,sku,name,category,description,terms,billing,selling_cents,reseller_cents,setup_cents,source_page) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[tenantId,p.sku,p.name,p.category,p.description,terms.trim(),p.billing,p.sellingCents,p.resellerCents,p.setupCents,p.sourcePage]);
  for(const p of changing){const row=existing.get(p.sku);await db.query("UPDATE store_products SET status='published',terms=$1,revision=revision+1 WHERE tenant_id=$2 AND sku=$3",[row?.terms.trim().length>=20?row.terms:terms.trim(),tenantId,p.sku]);}
  if(changing.length)await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,'reference_products_published')",[randomUUID(),tenantId,actor.id]);
  await db.query('COMMIT');return report;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function publishAllTenantProducts(pool,options){
 const tenants=(await pool.query("SELECT id FROM tenants WHERE status='active' ORDER BY id")).rows;
 const results=[];
 for(const tenant of tenants)results.push(await publishReferenceProducts(pool,{...options,tenantId:tenant.id}));
 return {scope:'all_active_tenants',tenants:results.length,changed:results.some(r=>r.changed),results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2),all=args.includes('--all-tenants'),index=args.indexOf('--tenant'),tenantId=index>=0?args[index+1]:undefined;
 if(all===(index>=0)||args.some(a=>!['--tenant','--all-tenants','--check','--publish-archived',tenantId].includes(a)))throw Error('Usage: node productPublish.js (--all-tenants | --tenant UUID) [--check] [--publish-archived]; terms via stdin');
 let terms='';for await(const chunk of process.stdin){terms+=chunk;if(Buffer.byteLength(terms)>16000)throw Error('Publication terms too large');}
 const pool=createDatabase(process.env.MYSQL_URL);
 try{const options={tenantId,terms,check:args.includes('--check'),publishArchived:args.includes('--publish-archived')};console.log(JSON.stringify(await (all?publishAllTenantProducts(pool,options):publishReferenceProducts(pool,options))));}
 catch(e){console.error(e.message);process.exitCode=1;}finally{await pool.end();}
}
