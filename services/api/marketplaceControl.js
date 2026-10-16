import {randomUUID} from 'node:crypto';
export const recommendedPlans = [
  {sku:'sip-personal',name:'SIP Personal',sellingCents:995,resellerCents:695,description:'One user SIP service subscription. PSTN usage and DID rental billed separately.'},
  {sku:'sip-team',name:'SIP Team',sellingCents:2995,resellerCents:2195,description:'Team workspace subscription. Seat capacity and PBX provisioning require operator confirmation; usage and numbers billed separately.'},
  {sku:'sip-business',name:'SIP Business',sellingCents:7995,resellerCents:5995,description:'Business service subscription with operator-assisted PBX onboarding. Capacity, support scope and usage rates must be agreed before publication.'}
];
export async function migrateMarketplaceControl(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS marketplace_stores (
 tenant_id CHAR(36) PRIMARY KEY, authorized BOOLEAN NOT NULL DEFAULT FALSE,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,gateway_admin BOOLEAN NOT NULL DEFAULT FALSE,
 name VARCHAR(100) NOT NULL DEFAULT '',updated_by CHAR(36) NOT NULL,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
}
export async function storePolicy(pool,tenant){return (await pool.query('SELECT authorized,enabled,gateway_admin,name FROM marketplace_stores WHERE tenant_id=$1',[tenant])).rows[0]||null;}
export async function canManageGateway(pool,user){
 if(user.role==='super_admin')return true;
 if(user.role!=='admin')return false;
 const p=await storePolicy(pool,user.tenant_id);return !!(p?.authorized&&p?.enabled&&p?.gateway_admin);
}
export async function handleMarketplaceControl({req,res,path,user,pool,send,readJson}){
 if(!['admin','super_admin'].includes(user.role))return send(res,403,{error:'Administrator required'});
 if(path==='/api/admin/marketplace/stores'&&req.method==='GET'){
  const r=await pool.query(`SELECT t.id,t.name AS tenant_name,t.slug,s.authorized,s.enabled,s.gateway_admin,s.name FROM tenants t LEFT JOIN marketplace_stores s ON s.tenant_id=t.id ${user.role==='super_admin'?'':'WHERE t.id=$1'} ORDER BY t.name`,user.role==='super_admin'?[]:[user.tenant_id]);
  return send(res,200,{stores:r.rows,editable:user.role==='super_admin',recommendedPlans});
 }
 if(path==='/api/admin/marketplace/profile'&&req.method==='PUT'){
  const p=await storePolicy(pool,user.tenant_id),b=await readJson(req);
  if(user.role!=='super_admin'&&!(p?.authorized&&p?.enabled))return send(res,403,{error:'Store authorization required'});
  if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||Object.keys(b).some(k=>k!=='name'))return send(res,400,{error:'Store name only; authorization requires a super administrator'});
  const r=await pool.query('UPDATE marketplace_stores SET name=$1,updated_by=$2 WHERE tenant_id=$3',[b.name.trim(),user.id,user.tenant_id]);
  return send(res,r.rowCount?200:404,{updated:!!r.rowCount});
 }
 if(path==='/api/admin/marketplace/stores'&&req.method==='PUT'){
  if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  const b=await readJson(req);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.tenantId||'')||['authorized','enabled','gatewayAdmin'].some(k=>typeof b[k]!=='boolean')||typeof b.name!=='string'||!b.name.trim()||b.name.length>100||(!b.authorized&&(b.enabled||b.gatewayAdmin)))return send(res,400,{error:'Valid tenant, store name and authorization flags required'});
  if(!(await pool.query('SELECT id FROM tenants WHERE id=$1',[b.tenantId])).rowCount)return send(res,404,{error:'Tenant unavailable'});
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');
   await db.query(`INSERT INTO marketplace_stores(tenant_id,authorized,enabled,gateway_admin,name,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE authorized=VALUES(authorized),enabled=VALUES(enabled),gateway_admin=VALUES(gateway_admin),name=VALUES(name),updated_by=VALUES(updated_by)`,[b.tenantId,b.authorized,b.enabled,b.gatewayAdmin,b.name.trim(),user.id]);
   await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'marketplace_authorization_updated')",[randomUUID(),b.tenantId,user.id]);
   await db.query('COMMIT');return send(res,200,{updated:true});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 if(path==='/api/admin/marketplace/recommended-plans'&&req.method==='POST'){
  const p=user.role==='super_admin'?null:await storePolicy(pool,user.tenant_id);
  if(user.role!=='super_admin'&&!(p?.authorized&&p?.enabled))return send(res,403,{error:'Store authorization required'});
  for(const plan of recommendedPlans)await pool.query(`INSERT IGNORE INTO store_products(tenant_id,sku,name,category,description,terms,billing,selling_cents,reseller_cents,setup_cents,status) VALUES($1,$2,$3,'SIP subscriptions',$4,'Operator must confirm delivery scope, capacity, cancellation and usage charges before publishing.','monthly',$5,$6,0,'draft')`,[user.tenant_id,plan.sku,plan.name,plan.description,plan.sellingCents,plan.resellerCents]);
  return send(res,200,{count:recommendedPlans.length,status:'draft'});
 }
 return send(res,404,{error:'Marketplace route unavailable'});
}
