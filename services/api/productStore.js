import {storePolicy} from './marketplaceControl.js';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {allowed,catalogPolicy} from './catalogControl.js';
export const referenceProducts=JSON.parse(fs.readFileSync(new URL('./data/product-reference.json',import.meta.url),'utf8'));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validSku=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(value);
const cycles={monthly:1,quarterly:3,annual:12};
export function validateProduct(b){
 return b&&typeof b.name==='string'&&b.name.trim().length>0&&b.name.length<=180&&typeof b.description==='string'&&b.description.length<=4000&&typeof b.terms==='string'&&b.terms.length<=4000&&['draft','published','archived'].includes(b.status)&&['one_time',...Object.keys(cycles)].includes(b.billing)&&['sellingCents','resellerCents','setupCents'].every(k=>Number.isSafeInteger(b[k])&&b[k]>=0&&b[k]<=100000000)&& (b.status!=='published'||(b.terms.trim().length>=20&&b.confirmAvailability===true));
}
export async function migrateProductStore(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS store_products (
 tenant_id CHAR(36) NOT NULL,sku VARCHAR(40) NOT NULL,name VARCHAR(180) NOT NULL,category VARCHAR(100) NOT NULL,
 description TEXT NOT NULL,terms TEXT NOT NULL,billing VARCHAR(16) NOT NULL,selling_cents INT NOT NULL,reseller_cents INT NOT NULL,setup_cents INT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'draft',source_page INT NULL,revision INT NOT NULL DEFAULT 1,
 PRIMARY KEY(tenant_id,sku),FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS store_orders (
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,sku VARCHAR(40) NOT NULL,
 request_key CHAR(36) NOT NULL,name VARCHAR(180) NOT NULL,billing VARCHAR(16) NOT NULL,quantity INT NOT NULL,
 unit_cents INT NOT NULL,setup_cents INT NOT NULL,terms TEXT NOT NULL,invoice_id CHAR(36) NOT NULL,
 status VARCHAR(24) NOT NULL DEFAULT 'awaiting_fulfillment',fulfillment_note TEXT NULL,next_bill_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),UNIQUE KEY store_request(user_id,request_key),
 FOREIGN KEY(tenant_id,sku) REFERENCES store_products(tenant_id,sku),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(invoice_id) REFERENCES invoices(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS store_renewals (
 order_id CHAR(36) NOT NULL,bill_at DATETIME(3) NOT NULL,invoice_id CHAR(36) NOT NULL,
 PRIMARY KEY(order_id,bill_at),FOREIGN KEY(order_id) REFERENCES store_orders(id),FOREIGN KEY(invoice_id) REFERENCES invoices(id)) ENGINE=InnoDB`);
}
export async function handleProductStore({req,res,path,user,pool,send,readJson}){
 const admin=path.startsWith('/api/admin/store');
 if(!user.features?.billing)return send(res,403,{error:'Billing unavailable'});
 if(admin&&!['admin','super_admin'].includes(user.role))return send(res,403,{error:'Administrator required'});
 const policy=await storePolicy(pool,user.tenant_id);
 if(policy&&(!policy.authorized||!policy.enabled)&&user.role!=='super_admin')return send(res,403,{error:'Store disabled by super administrator'});

 if(req.method!=='GET'&&!allowed(await catalogPolicy(pool,user.tenant_id),user,admin?'adminPlans':'planRequests'))return send(res,403,{error:'Catalog action disabled by tenant policy'});
 const root=admin?'/api/admin/store':'/api/store';
 if(!admin&&path==='/api/store/info'&&req.method==='GET'){
  const tenant=(await pool.query('SELECT name FROM tenants WHERE id=$1',[user.tenant_id])).rows[0];
  return send(res,200,{name:policy?.name||tenant?.name||'Olamide marketplace',currency:'USD'});
 }
 if(admin&&path===root+'/products'&&req.method==='POST'){
  const b=await readJson(req);
  if(!validateProduct(b)||!validSku(b.sku)||typeof b.category!=='string'||!b.category.trim()||b.category.length>100)return send(res,400,{error:'Valid SKU, category, product fields and prices required'});
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');
   await db.query(`INSERT INTO store_products(tenant_id,sku,name,category,description,terms,billing,selling_cents,reseller_cents,setup_cents,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[user.tenant_id,b.sku,b.name.trim(),b.category.trim(),b.description,b.terms,b.billing,b.sellingCents,b.resellerCents,b.setupCents,b.status]);
   await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'store_product_created')",[randomUUID(),user.tenant_id,user.id]);
   await db.query('COMMIT');return send(res,201,{sku:b.sku,status:b.status});
  }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'SKU already exists in this store'});throw e;}finally{db.release();}
 }
 if(path===root+'/products'&&req.method==='GET'){
  const fields=admin?'*':'sku,name,category,description,terms,billing,selling_cents,setup_cents,status,revision';
  const rows=await pool.query(`SELECT ${fields} FROM store_products WHERE tenant_id=$1 ${admin?'':"AND status='published'"} ORDER BY category,name`,[user.tenant_id]);
  return send(res,200,{products:rows.rows,sourceDate:'2010-08',currency:'USD'});
 }
 if(admin&&path===root+'/import-reference'&&req.method==='POST'){
  for(const p of referenceProducts)await pool.query(`INSERT IGNORE INTO store_products(tenant_id,sku,name,category,description,terms,billing,selling_cents,reseller_cents,setup_cents,source_page)
   VALUES($1,$2,$3,$4,$5,'',$6,$7,$8,$9,$10)`,[user.tenant_id,p.sku,p.name,p.category,p.description,p.billing,p.sellingCents,p.resellerCents,p.setupCents,p.sourcePage]);
  return send(res,200,{referenceCount:referenceProducts.length,status:'draft',message:'Existing customizations preserved'});
 }
 if(admin&&path===root+'/import'&&req.method==='POST'){
  const b=await readJson(req,2*1024*1024);
  if(!Array.isArray(b?.products)||!b.products.length||b.products.length>500)return send(res,400,{error:'Import 1 to 500 products per batch'});
  const seen=new Set(),errors=[];
  for(const [i,p] of b.products.entries()){
   if(!p||!validSku(p.sku)||seen.has(p.sku)||typeof p.category!=='string'||!p.category.trim()||p.category.length>100||!validateProduct({...p,status:'draft',terms:p.terms??''}))errors.push({row:i+1,error:'Invalid product fields, cents, category or duplicate SKU'});
   seen.add(p?.sku);
  }
  if(errors.length)return send(res,400,{error:'Import validation failed; no products imported',errors});
  const db=await pool.connect();let imported=0;
  try{
   await db.query('START TRANSACTION');
   for(const p of b.products){const r=await db.query(`INSERT IGNORE INTO store_products(tenant_id,sku,name,category,description,terms,billing,selling_cents,reseller_cents,setup_cents,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft')`,[user.tenant_id,p.sku,p.name.trim(),p.category.trim(),p.description,p.terms??'',p.billing,p.sellingCents,p.resellerCents,p.setupCents]);imported+=r.rowCount;}
   await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,'store_products_imported')",[randomUUID(),user.tenant_id,user.id]);
   await db.query('COMMIT');return send(res,200,{imported,skipped:b.products.length-imported,status:'draft'});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 if(admin&&path===root+'/products/bulk'&&req.method==='POST'){
  const b=await readJson(req,128*1024);
  if(!Array.isArray(b?.products)||!b.products.length||b.products.length>500||!['draft','published','archived'].includes(b.status)||
    b.products.some(p=>!p||!validSku(p.sku)||!Number.isSafeInteger(p.revision))||new Set(b.products.map(p=>p.sku)).size!==b.products.length)
   return send(res,400,{error:'Select 1 to 500 unique products with current revisions and a valid status'});
  const db=await pool.connect();
  try{
   await db.query('START TRANSACTION');
   for(const p of [...b.products].sort((a,c)=>a.sku.localeCompare(c.sku))){
    const row=(await db.query('SELECT revision,terms FROM store_products WHERE tenant_id=$1 AND sku=$2 FOR UPDATE',[user.tenant_id,p.sku])).rows[0];
    if(!row||row.revision!==p.revision){await db.query('ROLLBACK');return send(res,409,{error:'Product changed or unavailable: '+p.sku+'. Refresh before retrying.'});}
    if(b.status==='published'&&(b.confirmAvailability!==true||row.terms.trim().length<20)){
     await db.query('ROLLBACK');return send(res,400,{error:'Publishing requires availability confirmation and reviewed terms for '+p.sku});
    }
    await db.query('UPDATE store_products SET status=$1,revision=revision+1 WHERE tenant_id=$2 AND sku=$3',[b.status,user.tenant_id,p.sku]);
   }
   await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,'store_products_bulk_status')",[randomUUID(),user.tenant_id,user.id]);
   await db.query('COMMIT');return send(res,200,{updated:b.products.length,status:b.status});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 if(admin&&path===root+'/products'&&req.method==='PUT'){
  const b=await readJson(req);if(!validateProduct(b)||!validSku(b.sku)||!Number.isSafeInteger(b.revision))return send(res,400,{error:'Valid prices, revision, terms and availability confirmation required'});
  const r=await pool.query(`UPDATE store_products SET name=$1,description=$2,terms=$3,billing=$4,selling_cents=$5,reseller_cents=$6,setup_cents=$7,status=$8,revision=revision+1 WHERE tenant_id=$9 AND sku=$10 AND revision=$11`,[b.name.trim(),b.description,b.terms,b.billing,b.sellingCents,b.resellerCents,b.setupCents,b.status,user.tenant_id,b.sku,b.revision]);
  return send(res,r.rowCount?200:409,{updated:!!r.rowCount});
 }
 if(path===root+'/orders'&&req.method==='GET'){
  const r=await pool.query(`SELECT o.*,i.status AS payment_status,i.amount_cents FROM store_orders o JOIN invoices i ON i.id=o.invoice_id WHERE o.tenant_id=$1 ${admin?'':'AND o.user_id=$2'} ORDER BY o.created_at DESC LIMIT 200`,admin?[user.tenant_id]:[user.tenant_id,user.id]);
  return send(res,200,{orders:r.rows});
 }
 if(!admin&&path===root+'/orders'&&req.method==='POST'){
  const b=await readJson(req);if(!uuid.test(b.requestKey||'')||!validSku(b.sku)||!Number.isSafeInteger(b.quantity)||b.quantity<1||b.quantity>100||b.acceptTerms!==true)return send(res,400,{error:'Product, quantity, request key and accepted terms required'});
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');
   const existing=(await db.query('SELECT id,invoice_id FROM store_orders WHERE user_id=$1 AND request_key=$2',[user.id,b.requestKey])).rows[0];
   if(existing){await db.query('COMMIT');return send(res,200,existing);}
   const p=(await db.query("SELECT * FROM store_products WHERE tenant_id=$1 AND sku=$2 AND status='published' FOR UPDATE",[user.tenant_id,b.sku])).rows[0];
   if(!p||p.revision!==b.revision){await db.query('ROLLBACK');return send(res,409,{error:'Product changed or unavailable; refresh and accept current terms'});}
   const amount=(p.selling_cents+p.setup_cents)*b.quantity;
   if(!Number.isSafeInteger(amount)||amount>100000000){await db.query('ROLLBACK');return send(res,400,{error:'Order exceeds supported amount'});}
   const id=randomUUID(),invoiceId=randomUUID();
   await db.query("INSERT INTO invoices(id,user_id,description,amount_cents,currency,status) VALUES($1,$2,$3,$4,'USD',$5)",[invoiceId,user.id,`${p.name} x ${b.quantity} (${p.billing}, initial charge)`,amount,amount?'unpaid':'paid']);
   await db.query(`INSERT INTO store_orders(id,tenant_id,user_id,sku,request_key,name,billing,quantity,unit_cents,setup_cents,terms,invoice_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,user.tenant_id,user.id,p.sku,b.requestKey,p.name,p.billing,b.quantity,p.selling_cents,p.setup_cents,p.terms,invoiceId]);
   await db.query('COMMIT');return send(res,201,{id,invoice_id:invoiceId,status:'awaiting_fulfillment'});
  }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Order already submitted; refresh order history'});throw e;}finally{db.release();}
 }
 const action=new RegExp(`^${root}/orders/([0-9a-f-]{36})/(cancel|fulfill)$`,'i').exec(path);
 if(action&&req.method==='POST'){
  const [,id,operation]=action;if(!uuid.test(id)||operation==='fulfill'&&!admin)return send(res,403,{error:'Administrator required for fulfillment'});
  const b=await readJson(req);if(operation==='fulfill'&&(typeof b.note!=='string'||b.note.trim().length<10||b.note.length>2000))return send(res,400,{error:'Fulfillment receipt required'});
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');const o=(await db.query(`SELECT o.*,i.status AS payment_status FROM store_orders o JOIN invoices i ON i.id=o.invoice_id WHERE o.id=$1 AND o.tenant_id=$2 ${admin?'':'AND o.user_id=$3'} FOR UPDATE`,admin?[id,user.tenant_id]:[id,user.tenant_id,user.id])).rows[0];
   if(!o){await db.query('ROLLBACK');return send(res,404,{error:'Order unavailable'});}
   if(operation==='fulfill'&&(o.status!=='awaiting_fulfillment'||o.payment_status!=='paid')){await db.query('ROLLBACK');return send(res,409,{error:'Paid unfulfilled order required'});}
   if(operation==='cancel'){
    await db.query("UPDATE store_orders SET status='cancelled',next_bill_at=NULL WHERE id=$1",[id]);
    await db.query("UPDATE invoices SET status='void' WHERE status='unpaid' AND (id=$1 OR id IN (SELECT invoice_id FROM store_renewals WHERE order_id=$2))",[o.invoice_id,id]);
   }else{
    const months=cycles[o.billing];await db.query(`UPDATE store_orders SET status=$1,fulfillment_note=$2,next_bill_at=${months?`DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL ${months} MONTH)`:'NULL'} WHERE id=$3`,[months?'active':'fulfilled',b.note.trim(),id]);
   }
   await db.query('COMMIT');return send(res,200,{updated:true,message:operation==='cancel'?'Future invoices stopped. Paid charges require separate refund handling.':'Fulfillment recorded'});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 return send(res,404,{error:'Store route unavailable'});
}
export async function renewStoreOrders(pool){
 const db=await pool.connect();let locked=false;
 try{
  locked=Number((await db.query("SELECT GET_LOCK('olamide_store_renewals',0) AS acquired")).rows[0]?.acquired)===1;if(!locked)return;
  const due=await db.query("SELECT id FROM store_orders WHERE status='active' AND next_bill_at<=CURRENT_TIMESTAMP(3) LIMIT 100");
  for(const row of due.rows){
   await db.query('START TRANSACTION');
   try{
    const o=(await db.query("SELECT o.* FROM store_orders o JOIN users u ON u.id=o.user_id JOIN tenants t ON t.id=o.tenant_id WHERE o.id=$1 AND o.status='active' AND o.next_bill_at<=CURRENT_TIMESTAMP(3) AND u.status='active' AND t.status='active' FOR UPDATE",[row.id])).rows[0];
    if(o&&cycles[o.billing]){
     const unpaid=(await db.query("SELECT 1 FROM store_renewals r JOIN invoices i ON i.id=r.invoice_id WHERE r.order_id=$1 AND i.status='unpaid' LIMIT 1",[o.id])).rowCount;
     if(!unpaid){const id=randomUUID(),amount=o.unit_cents*o.quantity;
      await db.query("INSERT INTO invoices(id,user_id,description,amount_cents,currency,status) VALUES($1,$2,$3,$4,'USD',$5)",[id,o.user_id,`${o.name} subscription renewal`,amount,amount?'unpaid':'paid']);
      await db.query('INSERT INTO store_renewals(order_id,bill_at,invoice_id) VALUES($1,$2,$3)',[o.id,o.next_bill_at,id]);
      await db.query(`UPDATE store_orders SET next_bill_at=DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL ${cycles[o.billing]} MONTH) WHERE id=$1`,[o.id]);
     }
    }await db.query('COMMIT');
   }catch(e){await db.query('ROLLBACK');throw e;}
  }
 }finally{if(locked)await db.query("SELECT RELEASE_LOCK('olamide_store_renewals')");db.release();}
}
export function startStoreRenewals(pool){let busy=false;const run=async()=>{if(busy)return;busy=true;try{await renewStoreOrders(pool);}catch(e){console.error('Store renewals failed',e.name);}finally{busy=false;}};const timer=setInterval(run,60000);timer.unref();return()=>clearInterval(timer);}
