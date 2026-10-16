import {randomUUID} from 'node:crypto';
import {seal,unseal} from './providerCredentials.js';
import {canManageGateway,storePolicy} from './marketplaceControl.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=()=>/^[a-f0-9]{64}$/i.test(process.env.PAYMENT_CONFIG_KEY||'')?Buffer.from(process.env.PAYMENT_CONFIG_KEY,'hex'):null;
export const gatewayCatalog=[
 {id:'stripe',name:'Stripe',implemented:true},
 {id:'paystack',name:'Paystack',implemented:true},
 {id:'flutterwave',name:'Flutterwave',implemented:true},
 ...['PayPal','Square','Adyen','Braintree','Authorize.Net','Razorpay','Mollie','Checkout.com','Worldpay','Amazon Pay','Coinbase Commerce','Paddle','2Checkout','PayU','Mercado Pago'].map(name=>({id:name.toLowerCase().replace(/[^a-z0-9]/g,''),name,implemented:false}))
];
export function validCheckoutUrl(provider,value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&({paystack:['checkout.paystack.com'],flutterwave:['checkout.flutterwave.com'],stripe:['checkout.stripe.com']}[provider]||[]).includes(u.hostname);}catch{return false;}}
export async function migrateStoreGateways(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS store_gateways (
 tenant_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,enabled BOOLEAN NOT NULL DEFAULT FALSE,
 environment VARCHAR(12) NOT NULL,ciphertext BLOB NOT NULL,updated_by CHAR(36) NOT NULL,
 PRIMARY KEY(tenant_id,provider),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
}
async function gateway(pool,tenant,provider,{allowDisabled=false}={}){
 const row=(await pool.query('SELECT enabled,environment,ciphertext FROM store_gateways WHERE tenant_id=$1 AND provider=$2',[tenant,provider])).rows[0];
 if(!row||(!row.enabled&&!allowDisabled)||!key())return null;
 return {...unseal(row.ciphertext,key(),tenant,provider),environment:row.environment};
}
async function api(provider,path,secret,body,fetchImpl){
 const base=provider==='paystack'?'https://api.paystack.co':'https://api.flutterwave.com/v3';
 const r=await fetchImpl(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const data=await r.json();if(!r.ok||!(data.status===true||data.status==='success'))throw Error('Provider request failed');return data.data;
}
export async function handleStoreGateways({req,res,path,user,pool,send,readJson,origin,fetchImpl=fetch}){
 const admin=path.startsWith('/api/admin/marketplace/');
 if(admin&&!['admin','super_admin'].includes(user.role))return send(res,403,{error:'Administrator required'});
 if(path==='/api/admin/marketplace/gateways'&&req.method==='GET'){
  const r=await pool.query('SELECT provider,enabled,environment FROM store_gateways WHERE tenant_id=$1',[user.tenant_id]);
  return send(res,200,{catalog:gatewayCatalog,gateways:r.rows,editable:await canManageGateway(pool,user),encryptionReady:!!key()});
 }
 if(path==='/api/admin/marketplace/gateways'&&req.method==='PUT'){
  if(!await canManageGateway(pool,user))return send(res,403,{error:'Store gateway administration not authorized'});
  const b=await readJson(req);
  if(!['paystack','flutterwave'].includes(b.provider)||typeof b.enabled!=='boolean'||!['test','live'].includes(b.environment)||!key()||b.environment==='live'&&b.enabled&&b.confirmLive!==true)return send(res,400,{error:'Supported provider, encryption key, mode and live confirmation required'});
  const old=(await pool.query('SELECT ciphertext FROM store_gateways WHERE tenant_id=$1 AND provider=$2',[user.tenant_id,b.provider])).rows[0];
  let credentials=old?unseal(old.ciphertext,key(),user.tenant_id,b.provider):{};
  if(b.secretKey!==undefined){
   if(typeof b.secretKey!=='string'||b.secretKey.length<16||b.secretKey.length>500||/\s/.test(b.secretKey))return send(res,400,{error:'Valid secret API key required'});
   const test=b.provider==='paystack'?/^sk_test_/.test(b.secretKey):/TEST/i.test(b.secretKey);
   if((b.environment==='test')!==test)return send(res,400,{error:'API key does not match selected environment'});
   credentials={secretKey:b.secretKey};
  }
  if(!credentials.secretKey)return send(res,400,{error:'Secret API key required'});
  const savedTest=b.provider==='paystack'?/^sk_test_/.test(credentials.secretKey):/TEST/i.test(credentials.secretKey);
  if((b.environment==='test')!==savedTest)return send(res,400,{error:'Stored API key does not match selected environment'});
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');
   await db.query(`INSERT INTO store_gateways(tenant_id,provider,enabled,environment,ciphertext,updated_by) VALUES($1,$2,$3,$4,$5,$6) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),environment=VALUES(environment),ciphertext=VALUES(ciphertext),updated_by=VALUES(updated_by)`,[user.tenant_id,b.provider,b.enabled,b.environment,seal(credentials,key(),user.tenant_id,b.provider),user.id]);
   await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)",[randomUUID(),user.tenant_id,user.id,'store_gateway_updated_'+b.provider]);
   await db.query('COMMIT');return send(res,200,{updated:true});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 if(!user.features?.billing)return send(res,403,{error:'Billing unavailable'});
 const policy=await storePolicy(pool,user.tenant_id);
 if(policy&&(!policy.authorized||!policy.enabled))return send(res,403,{error:'Store disabled'});
 if(path==='/api/marketplace/gateways'&&req.method==='GET'){
  const r=await pool.query('SELECT provider FROM store_gateways WHERE tenant_id=$1 AND enabled=TRUE',[user.tenant_id]);
  return send(res,200,{providers:key()?r.rows.map(r=>r.provider):[]});
 }
 if(path==='/api/marketplace/checkout'&&req.method==='POST'){
  const b=await readJson(req);
  if(!uuid.test(b.invoiceId||'')||!['paystack','flutterwave'].includes(b.provider))return send(res,400,{error:'Valid invoice and provider required'});
  const g=await gateway(pool,user.tenant_id,b.provider);if(!g)return send(res,503,{error:'Gateway unavailable'});
  const db=await pool.connect();let attempt,invoice;
  try{
   await db.query('START TRANSACTION');
   invoice=(await db.query("SELECT i.*,u.email FROM invoices i JOIN users u ON u.id=i.user_id WHERE i.id=$1 AND i.user_id=$2 AND u.tenant_id=$3 AND i.status='unpaid' FOR UPDATE",[b.invoiceId,user.id,user.tenant_id])).rows[0];
   if(!invoice||invoice.currency!=='USD'||invoice.amount_cents<1){await db.query('ROLLBACK');return send(res,409,{error:'Unpaid USD invoice required'});}
   // The invoice lock serializes creation across all three providers.
   const active=(await db.query("SELECT id FROM payment_attempts WHERE invoice_id=$1 AND tenant_id=$2 AND status IN ('creating','open') LIMIT 1 FOR UPDATE",[invoice.id,user.tenant_id])).rows[0];
   if(active){await db.query('ROLLBACK');return send(res,409,{error:'An existing checkout is pending. Verify it before opening another.'});}
   attempt=randomUUID();
   await db.query('INSERT INTO payment_attempts(id,tenant_id,user_id,invoice_id,provider,amount_cents,currency) VALUES($1,$2,$3,$4,$5,$6,$7)',[attempt,user.tenant_id,user.id,invoice.id,b.provider,invoice.amount_cents,invoice.currency]);
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  try{
   const result=await api(b.provider,b.provider==='paystack'?'/transaction/initialize':'/payments',g.secretKey,b.provider==='paystack'?{email:invoice.email,amount:invoice.amount_cents,currency:invoice.currency,reference:attempt,callback_url:origin+'/#billing'}:{tx_ref:attempt,amount:(invoice.amount_cents/100).toFixed(2),currency:invoice.currency,redirect_url:origin+'/#billing',customer:{email:invoice.email}},fetchImpl);
   const url=result.authorization_url||result.link;
   if(!validCheckoutUrl(b.provider,url))throw Error('Invalid checkout destination');
   await pool.query("UPDATE payment_attempts SET status='open',checkout_url=$1 WHERE id=$2 AND tenant_id=$3",[url,attempt,user.tenant_id]);
   return send(res,201,{url,attemptId:attempt});
  }catch{
   // Provider may have accepted a timed-out request. Keep it reconcilable; do not create a replacement charge.
   await pool.query("UPDATE payment_attempts SET status='open' WHERE id=$1 AND tenant_id=$2",[attempt,user.tenant_id]);
   return send(res,502,{error:'Checkout response unavailable. Use Verify payment before retrying.'});
  }
 }
 if(path==='/api/marketplace/payment-attempts'&&req.method==='GET'){
  const r=await pool.query("SELECT id,invoice_id,provider,status,checkout_url FROM payment_attempts WHERE tenant_id=$1 AND user_id=$2 AND provider IN ('paystack','flutterwave') ORDER BY created_at DESC LIMIT 100",[user.tenant_id,user.id]);
  return send(res,200,{attempts:r.rows});
 }
 if(path==='/api/marketplace/verify'&&req.method==='POST'){
  const b=await readJson(req);if(!uuid.test(b.attemptId||''))return send(res,400,{error:'Valid payment attempt required'});
  const a=(await pool.query('SELECT * FROM payment_attempts WHERE id=$1 AND tenant_id=$2 AND user_id=$3',[b.attemptId,user.tenant_id,user.id])).rows[0];
  if(!a||!['paystack','flutterwave'].includes(a.provider))return send(res,404,{error:'Payment attempt unavailable'});
  if(a.status==='paid')return send(res,200,{status:'paid'});
  const result=await reconcileStorePayment(pool,a,{fetchImpl});return send(res,result.status,result.body);
 }
 return send(res,404,{error:'Gateway route unavailable'});
}
export function matchesPayment(a,d){
 if(!d||typeof d!=='object')return false;
 const amount=a.provider==='paystack'?Number(d.amount):Math.round(Number(d.amount)*100);
 return (a.provider==='paystack'?d.status==='success'&&d.reference===a.id:d.status==='successful'&&d.tx_ref===a.id)&&amount===a.amount_cents&&d.currency===a.currency&&d.id!=null;
}

export async function reconcileStorePayment(pool,a,{fetchImpl=fetch}={}){
 const result=(status,body)=>({status,body});
 if(a.status==='paid')return result(200,{status:'paid'});
  const g=await gateway(pool,a.tenant_id,a.provider,{allowDisabled:true});if(!g)return result(503,{error:'Gateway unavailable'});
  let data;try{data=await api(a.provider,a.provider==='paystack'?'/transaction/verify/'+a.id:'/transactions/verify_by_reference?tx_ref='+a.id,g.secretKey,null,fetchImpl);}catch{return result(502,{error:'Verification unavailable; payment remains pending'});}
  if(!matchesPayment(a,data))return result(409,{error:'Payment pending or reconciliation mismatch'});
  const db=await pool.connect();try{
   await db.query('START TRANSACTION');
   const invoice=(await db.query('SELECT status,amount_cents,currency FROM invoices WHERE id=$1 AND user_id=$2 FOR UPDATE',[a.invoice_id,a.user_id])).rows[0];
   if(!invoice||invoice.status==='void'||invoice.amount_cents!==a.amount_cents||invoice.currency!==a.currency){await db.query('ROLLBACK');return result(409,{error:'Invoice reconciliation mismatch'});}
   const current=(await db.query('SELECT status FROM payment_attempts WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[a.id,a.tenant_id])).rows[0];
   if(current?.status==='paid'){await db.query('COMMIT');return result(200,{status:'paid'});}
   if(invoice.status==='paid'){await db.query('ROLLBACK');return result(409,{error:'Invoice already paid; review duplicate transaction before reconciliation'});}
   await db.query("UPDATE payment_attempts SET status='paid',session_id=$1 WHERE id=$2 AND tenant_id=$3",[a.provider+':'+data.id,a.id,a.tenant_id]);
   await db.query("UPDATE invoices SET status='paid' WHERE id=$1 AND user_id=$2 AND status='unpaid'",[a.invoice_id,a.user_id]);
   await db.query('COMMIT');return result(200,{status:'paid'});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
