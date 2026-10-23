import {randomUUID} from 'node:crypto';
import {hubSettings,twilioRequest} from './twilioHub.js';
import {roleSettings} from './twilioRoles.js';
import {providerAccess} from './providerManager.js';
import {geoCallingAccess} from './geoCalling.js';
import {serviceLocationAccess} from './locationPolicy.js';
import {isUuid,isNumber,localRentalCents,nextRental,confirmedNumber,twilioDidClient,lockOrder,transaction,submitPurchase,finalizePurchase} from './twilioDidCore.js';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const root='/api/twilio/dids',admin='/api/admin/twilio/dids';
export async function migrateTwilioDids(db){for(const sql of [
 `CREATE TABLE IF NOT EXISTS twilio_did_settings(tenant_id CHAR(36) PRIMARY KEY,policy JSON NOT NULL,version INT NOT NULL,updated_by CHAR(36) NOT NULL) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS twilio_did_orders(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,request_key CHAR(36) NOT NULL,number_e164 VARCHAR(16) NOT NULL,country CHAR(2) NOT NULL,account_sid CHAR(34) NOT NULL,trunk_sid CHAR(34) NOT NULL,hub_version INT NOT NULL,policy_version INT NOT NULL,provider_cost VARCHAR(32) NOT NULL,monthly_cents INT NOT NULL,quote_expires_ms BIGINT NOT NULL,status VARCHAR(24) NOT NULL,invoice_id CHAR(36) NULL,resource_sid CHAR(34) NULL,rental_until_ms BIGINT NULL,submitted_ms BIGINT NULL,post_claimed BOOLEAN NOT NULL DEFAULT FALSE,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),UNIQUE KEY tw_did_request(tenant_id,user_id,request_key),UNIQUE KEY tw_did_resource(resource_sid),INDEX tw_did_due(status,rental_until_ms),INDEX tw_did_user(tenant_id,user_id)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS twilio_did_number_locks(number_e164 VARCHAR(16) PRIMARY KEY,order_id CHAR(36) NOT NULL UNIQUE) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS twilio_did_periods(order_id CHAR(36) NOT NULL,period_ms BIGINT NOT NULL,invoice_id CHAR(36) NOT NULL,amount_cents INT NOT NULL,PRIMARY KEY(order_id,period_ms),UNIQUE KEY tw_did_invoice(invoice_id)) ENGINE=InnoDB`
 ])await db.query(sql);}
export async function didPolicy(db,tenant){const r=(await db.query('SELECT policy,version FROM twilio_did_settings WHERE tenant_id=$1',[tenant])).rows[0];return r?{...parse(r.policy),version:Number(r.version)}:{enabled:false,countries:['US','CA'],reference:'',version:0};}
async function access(db,user,sessionHash){
 if(!user?.features?.billing)throw Error('Billing access required');
 const location=await serviceLocationAccess(db,user.tenant_id,user.id,{sessionHash,requireSession:true});if(!location.allowed)throw Error(location.reason);
 const provider=await providerAccess(db,user.tenant_id,'twilio');if(!provider.allowed)throw Error(provider.reason);
 const geo=await geoCallingAccess(db,{tenantId:user.tenant_id,userId:user.id,provider:'twilio',checkCallerId:false,sessionHash});if(!geo.allowed)throw Error(geo.reason);
}
async function setup(db,tenant,{existing=false}={}){const [hub,roles,policy]=await Promise.all([hubSettings(db,tenant),roleSettings(db,tenant),didPolicy(db,tenant)]);if(!hub?.credentials||!existing&&(!hub.enabled||!roles.did))throw Error('Super admin must configure Twilio credentials and enable the DID role');return {hub,roles,policy,request:twilioDidClient(hub.credentials)};}
function ownedOrder(db,id,user){return db.query('SELECT * FROM twilio_did_orders WHERE id=$1 AND tenant_id=$2'+(user.role==='super_admin'?'':' AND user_id=$3'),user.role==='super_admin'?[id,user.tenant_id]:[id,user.tenant_id,user.id]).then(r=>{if(!r.rows[0])throw Error('Order unavailable');return r.rows[0];});}
async function checkInventory(request,country,number){const r=await request('available',{country,number});const rows=(r.available_phone_numbers||[]).filter(n=>n.phone_number===number);if(rows.length!==1||rows[0].capabilities?.voice!==true)throw Error('Number unavailable in current voice inventory');if(rows[0].address_requirements!=='none')throw Error('Address or regulatory review required; automatic checkout is unavailable for this number');return rows[0];}
export async function quoteTwilioDid(pool,user,b,sessionHash){
 if(!isNumber(b?.number)||!isUuid(b.requestKey)||!['US','CA'].includes(b.country))throw Error('Exact US/CA local number, country and request ID required');
 await access(pool,user,sessionHash);const {hub,roles,policy,request}=await setup(pool,user.tenant_id);
 if(!policy.enabled||!policy.countries.includes(b.country)||!/^TK[a-f0-9]{32}$/i.test(roles.trunkSid||''))throw Error('Twilio number checkout awaits super-admin approval and trunk configuration');
 const prior=(await pool.query('SELECT * FROM twilio_did_orders WHERE tenant_id=$1 AND user_id=$2 AND request_key=$3',[user.tenant_id,user.id,b.requestKey])).rows[0];
 if(prior){if(prior.number_e164!==b.number||prior.country!==b.country)throw Error('Request ID already used');return publicOrder(prior);}
 await checkInventory(request,b.country,b.number);const price=localRentalCents(await request('prices',{country:b.country}));
 const id=randomUUID();await pool.query("INSERT INTO twilio_did_orders(id,tenant_id,user_id,request_key,number_e164,country,account_sid,trunk_sid,hub_version,policy_version,provider_cost,monthly_cents,quote_expires_ms,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'quoted')",[id,user.tenant_id,user.id,b.requestKey,b.number,b.country,hub.credentials.accountSid,roles.trunkSid,hub.version,policy.version,price.providerCost,price.monthlyCents,Date.now()+300000]);
 return {id,number_e164:b.number,status:'quoted',monthly_cents:price.monthlyCents,setupCents:0,markupPercent:30,quote_expires_ms:Date.now()+300000};
}
export async function buyTwilioDid(pool,user,b,sessionHash){
 if(!isUuid(b?.id)||b.acceptTerms!==true||!Number.isSafeInteger(b.monthlyCents))throw Error('Order, quoted monthly price and recurring rental consent required');
 return lockOrder(pool,b.id,async db=>{
  let o=await ownedOrder(db,b.id,user);if(o.user_id!==user.id)throw Error('Only the buyer may authorize payment');
  if(o.status!=='quoted')return publicOrder(o);
  await access(db,user,sessionHash);const {hub,roles,policy,request}=await setup(db,user.tenant_id);
  if(!policy.enabled||!policy.countries.includes(o.country)||Number(o.quote_expires_ms)<Date.now()||Number(o.monthly_cents)!==b.monthlyCents||Number(o.hub_version)!==hub.version||Number(o.policy_version)!==policy.version||o.account_sid!==hub.credentials.accountSid||o.trunk_sid!==roles.trunkSid)throw Error('Quote or provider configuration changed; refresh the quote');
  await checkInventory(request,o.country,o.number_e164);const price=localRentalCents(await request('prices',{country:o.country}));if(price.monthlyCents!==b.monthlyCents)throw Error('Provider price changed; obtain a new quote');
  // Existing remotely owned numbers cannot be sold to a different platform user.
  const owned=await request('owned',{number:o.number_e164});if(!Array.isArray(owned.incoming_phone_numbers)||owned.incoming_phone_numbers.length)throw Error('Number is already owned or inventory is inconclusive; request review');
  await transaction(db,async()=>{
   await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);
   await access(db,user,sessionHash);
   const fresh=await setup(db,user.tenant_id);
   if(!fresh.policy.enabled||fresh.policy.version!==Number(o.policy_version)||fresh.hub.version!==Number(o.hub_version)||fresh.roles.trunkSid!==o.trunk_sid||fresh.hub.credentials.accountSid!==o.account_sid||Number(o.quote_expires_ms)<Date.now())throw Error('Purchase authorization changed; refresh quote');
   const active=(await db.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active' FOR UPDATE",[user.id,user.tenant_id])).rows[0];if(!active)throw Error('Active account required');
   const wallet=(await db.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[user.id,user.tenant_id])).rows[0],balance=Number(wallet?.balance_cents);
   if(wallet?.currency!=='USD'||!Number.isSafeInteger(balance)||balance<b.monthlyCents)throw Error('Insufficient available USD wallet balance');
   await db.query('INSERT INTO twilio_did_number_locks(number_e164,order_id) VALUES($1,$2)',[o.number_e164,o.id]);
   o={...o,invoice_id:randomUUID(),submitted_ms:Date.now()};
   await db.query('UPDATE wallet_accounts SET balance_cents=balance_cents-$1 WHERE user_id=$2 AND tenant_id=$3',[b.monthlyCents,user.id,user.tenant_id]);
   await db.query("UPDATE twilio_did_orders SET status='submitting',invoice_id=$1,submitted_ms=$2 WHERE id=$3 AND status='quoted'",[o.invoice_id,o.submitted_ms,o.id]);
  });
  return submitPurchase(db,o,request);
 });
}
export function publicOrder(o){return Object.fromEntries(['id','number_e164','country','monthly_cents','quote_expires_ms','status','rental_until_ms'].map(k=>[k,o[k]]));}
async function released(db,o){await transaction(db,async()=>{await db.query("UPDATE twilio_did_orders SET status='released' WHERE id=$1",[o.id]);await db.query('DELETE FROM twilio_did_number_locks WHERE order_id=$1',[o.id]);});return {id:o.id,status:'released'};}
async function releaseNumber(db,o,request){
 // Persist before the DELETE. Neither a network timeout nor a process crash
 // permits an automatic repeat. Read-only reconciliation is a separate action.
 await db.query("UPDATE twilio_did_orders SET status='releasing' WHERE id=$1",[o.id]);
 try{const r=await request('release',{sid:o.resource_sid});if(r.released!==true)throw Error('Unconfirmed release');}catch{await db.query("UPDATE twilio_did_orders SET status='release_unknown' WHERE id=$1",[o.id]);return {id:o.id,status:'release_unknown',note:'Administrator reconciliation required. No further customer rental charge is attempted.'};}
 return released(db,o);
}
export async function reconcileTwilioDid(pool,user,id){return lockOrder(pool,id,async db=>{
 const o=await ownedOrder(db,id,user),{hub,request}=await setup(db,o.tenant_id,{existing:true});if(hub.credentials.accountSid!==o.account_sid)throw Error('Restore the original owning Twilio account credentials');
 if(['releasing','release_unknown'].includes(o.status)){try{await request('fetch',{sid:o.resource_sid});throw Error('Number still exists remotely; operator review required before a new release');}catch(e){if(e.status===404&&e.providerCode===20404)return released(db,o);throw e;}}
 if(!['submitting','unknown','purchased'].includes(o.status))return publicOrder(o);
 const r=await request('owned',{number:o.number_e164});if(r.next_page_uri)throw Error('Incomplete owned inventory; operator review required');const matches=(r.incoming_phone_numbers||[]).filter(n=>confirmedNumber(n,o));if(matches.length!==1)throw Error('No unique confirmed purchase for this order; funds stay held pending review');
 await finalizePurchase(db,o,matches[0]);return publicOrder(await ownedOrder(db,id,user));
 });}
export async function renewTwilioDid(pool,id){return lockOrder(pool,id,async db=>{
 const o=(await db.query('SELECT * FROM twilio_did_orders WHERE id=$1',[id])).rows[0];if(!o||o.status!=='allocated'||Number(o.rental_until_ms)>Date.now())return;
 let c;try{c=await setup(db,o.tenant_id,{existing:true});if(c.hub.credentials.accountSid!==o.account_sid)throw Error('Account changed');}catch{await db.query("UPDATE twilio_did_orders SET status='renewal_review' WHERE id=$1",[id]);return;}
 if(!c.hub.enabled||!c.roles.did||!(await providerAccess(db,o.tenant_id,'twilio')).allowed)return releaseNumber(db,o,c.request);
 const remote=await c.request('fetch',{sid:o.resource_sid});if(!confirmedNumber(remote,o))throw Error('Renewal ownership mismatch');
 const price=localRentalCents(await c.request('prices',{country:o.country}));
 const user=(await db.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active'",[o.user_id,o.tenant_id])).rows[0];
 if(!user||price.monthlyCents>Number(o.monthly_cents)||Date.now()-Number(o.rental_until_ms)>86400000)return releaseNumber(db,o,c.request);
 let funded=true;
 await transaction(db,async()=>{
  const wallet=(await db.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[o.user_id,o.tenant_id])).rows[0],balance=Number(wallet?.balance_cents);
  if(wallet?.currency!=='USD'||!Number.isSafeInteger(balance)||balance<Number(o.monthly_cents)){funded=false;return;}
  const invoice=randomUUID(),amount=Number(o.monthly_cents),period=Number(o.rental_until_ms);
  await db.query("INSERT INTO invoices(id,user_id,description,amount_cents,status) VALUES($1,$2,$3,$4,'paid')",[invoice,o.user_id,'TWI '+o.number_e164+' monthly renewal',amount]);
  await db.query('INSERT INTO twilio_did_periods(order_id,period_ms,invoice_id,amount_cents) VALUES($1,$2,$3,$4)',[id,period,invoice,amount]);
  await db.query('UPDATE wallet_accounts SET balance_cents=balance_cents-$1 WHERE user_id=$2 AND tenant_id=$3',[amount,o.user_id,o.tenant_id]);
  await db.query('INSERT INTO wallet_purchases(id,tenant_id,user_id,invoice_id,amount_cents,balance_after_cents) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),o.tenant_id,o.user_id,invoice,amount,balance-amount]);
  await db.query('UPDATE twilio_did_orders SET rental_until_ms=$1 WHERE id=$2',[nextRental(period,Number(o.submitted_ms)||period),id]);
 });if(!funded)return releaseNumber(db,o,c.request);
 });}
export function startTwilioDidRenewals(pool){let busy=false;const tick=async()=>{if(busy)return;busy=true;try{const rows=(await pool.query("SELECT id FROM twilio_did_orders WHERE status='allocated' AND rental_until_ms<=$1 ORDER BY rental_until_ms LIMIT 20",[Date.now()])).rows;for(const row of rows)try{await renewTwilioDid(pool,row.id);}catch{console.error('Twilio DID renewal requires review',row.id);}}catch{console.error('Twilio DID renewal scan unavailable');}finally{busy=false;}};const timer=setInterval(tick,60000);timer.unref?.();return()=>clearInterval(timer);}
export async function handleTwilioDids({req,res,path,user,pool,send,readJson,sessionHash}){
 res.setHeader('Cache-Control','no-store');try{
 if(path.startsWith(admin)){
  if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  if(path===admin&&req.method==='GET')return send(res,200,{policy:await didPolicy(pool,user.tenant_id),orders:(await pool.query('SELECT id,user_id,number_e164,status,monthly_cents,rental_until_ms FROM twilio_did_orders WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',[user.tenant_id])).rows});
  if(path===admin&&req.method==='PUT'){
   const b=await readJson(req);if(typeof b.enabled!=='boolean'||!Number.isInteger(b.version)||!Array.isArray(b.countries)||!b.countries.length||b.countries.some(c=>!['US','CA'].includes(c))||typeof b.reference!=='string'||b.reference.length>200||b.enabled&&(!b.reference.trim()||b.acceptRecurringLiability!==true))throw Error('Country list, version, operating reference and recurring-liability acknowledgment required');
   if(b.enabled){const c=await setup(pool,user.tenant_id);const remote=await twilioRequest(c.hub.credentials,'trunk-fetch',{trunkSid:c.roles.trunkSid});if(remote.account_sid!==c.hub.credentials.accountSid)throw Error('Trunk account mismatch');}
   await transactionWithPool(pool,async db=>{await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);const old=await didPolicy(db,user.tenant_id);if(old.version!==b.version)throw Error('Settings changed; refresh');await db.query('INSERT INTO twilio_did_settings(tenant_id,policy,version,updated_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE policy=VALUES(policy),version=VALUES(version),updated_by=VALUES(updated_by)',[user.tenant_id,JSON.stringify({enabled:b.enabled,countries:[...new Set(b.countries)],reference:b.reference.trim()}),b.version+1,user.id]);await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'twilio_did_policy_saved')",[randomUUID(),user.tenant_id,user.id]);});return send(res,200,{saved:true});
  }
  if(path===admin+'/reconcile'&&req.method==='POST'){const b=await readJson(req);if(!isUuid(b.id))throw Error('Order ID required');return send(res,200,await reconcileTwilioDid(pool,user,b.id));}
  if(path===admin+'/release'&&req.method==='POST'){const b=await readJson(req);if(!isUuid(b.id)||b.confirm!==true)throw Error('Confirm remote release');return send(res,200,await lockOrder(pool,b.id,async db=>{const o=await ownedOrder(db,b.id,user);if(!['allocated','renewal_review','releasing','release_unknown'].includes(o.status))throw Error('Order not eligible for release');const {hub,request}=await setup(db,o.tenant_id,{existing:true});if(hub.credentials.accountSid!==o.account_sid||!confirmedNumber(await request('fetch',{sid:o.resource_sid}),o))throw Error('Original remote ownership must be confirmed before release');return releaseNumber(db,o,request);}));}
 }
 if(!user?.features?.billing)return send(res,403,{error:'Billing access required'});
 if(path===root&&req.method==='GET'){const policy=await didPolicy(pool,user.tenant_id);return send(res,200,{orders:(await pool.query('SELECT id,number_e164,country,monthly_cents,quote_expires_ms,status,rental_until_ms FROM twilio_did_orders WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100',[user.tenant_id,user.id])).rows,policy:{enabled:policy.enabled,countries:policy.countries}});}
 if(path===root+'/quote'&&req.method==='POST')return send(res,200,await quoteTwilioDid(pool,user,await readJson(req),sessionHash));
 if(path===root+'/purchase'&&req.method==='POST')return send(res,200,await buyTwilioDid(pool,user,await readJson(req),sessionHash));
 if(path===root+'/cancel'&&req.method==='POST'){const b=await readJson(req);if(!isUuid(b.id)||b.confirm!==true)throw Error('Confirm immediate release; unused rental is not refunded');return send(res,200,await lockOrder(pool,b.id,async db=>{const o=await ownedOrder(db,b.id,user);if(o.user_id!==user.id||o.status!=='allocated')throw Error('Only an allocated number owned by this buyer can be released');const c=await setup(db,user.tenant_id,{existing:true});if(c.hub.credentials.accountSid!==o.account_sid)throw Error('Original provider account credentials required');return releaseNumber(db,o,c.request);}));}
 return send(res,405,{error:'Unsupported Twilio DID action'});
 }catch(e){if(e.code){console.error('Twilio DID operation requires review',e.code);return send(res,409,{error:'Order requires review. Refresh status before any new purchase.'});}return send(res,409,{error:e.message});}
}
async function transactionWithPool(pool,fn){const db=await pool.connect();try{return await transaction(db,()=>fn(db));}finally{db.release();}}
