import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {flowrouteCustomerRate} from './flowrouteCustomerRate.js';
import {assignedIdentity,loadPolicy} from './outboundDids.js';
import {loadTelecomPolicies,selectPolicyRate} from './telecomPolicies.js';

const countries=JSON.parse(readFileSync(new URL('./dialingCountries.json',import.meta.url),'utf8'));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const json=v=>typeof v==='string'?JSON.parse(v):v;
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const maxCents=100000000;
export const planDays=30;
export function rateMicros(value){
 const m=/^(0|[1-9]\d{0,5})(?:\.(\d{1,6}))?$/.exec(String(value));
 if(!m)throw Error('Valid selling rate required');
 return BigInt(m[1])*1000000n+BigInt((m[2]||'').padEnd(6,'0'));
}
export function validatePlanUsage(input){
 if(!input||!Array.isArray(input.destinations)||input.destinations.length<1||input.destinations.length>10)throw Error('Choose 1–10 calling countries');
 const seen=new Set();let total=0;
 return input.destinations.map(row=>{
  const country=String(row?.country||'').toUpperCase(),metadata=countries[country];
  if(!metadata||!Number.isSafeInteger(row.dailyMinutes)||row.dailyMinutes<1||row.dailyMinutes>1440)throw Error('Select a country and 1–1440 whole daily minutes');
  const sample=String(row.sampleNumber||'').replace(/[ ()-]/g,'');
  if(sample&&(!/^\+[1-9]\d{7,14}$/.test(sample)||!sample.slice(1).startsWith(metadata.code)))throw Error('Example number must use the selected country calling code in international format');
  if(!sample&&Object.values(countries).filter(c=>c.code===metadata.code).length>1)throw Error('This country shares its calling code. Enter an example destination number for its rate estimate');
  const signature=country+'/'+sample;if(seen.has(signature))throw Error('Combine duplicate country and example-number rows');seen.add(signature);
  total+=row.dailyMinutes;if(total>1440)throw Error('Total projected daily calling cannot exceed 1440 minutes');
  return {country,callingCode:metadata.code,dailyMinutes:row.dailyMinutes,sampleNumber:sample};
 });
}
export function calculatePlan(lines){
 let total=0;const destinations=lines.map(line=>{
  const micros=rateMicros(line.sellingRate),monthlyMinutes=line.dailyMinutes*planDays;
  const monthlyCents=Number((micros*BigInt(monthlyMinutes)+9999n)/10000n);
  if(!Number.isSafeInteger(monthlyCents)||monthlyCents<0||monthlyCents>maxCents)throw Error('Projected monthly amount exceeds supported funding limit');
  total+=monthlyCents;
  return {...line,monthlyMinutes,monthlyCents};
 });
 if(total<1||total>maxCents)throw Error('Projected monthly budget must be between $0.01 and $1,000,000');
 return {days:planDays,currency:'USD',dailyMinutes:lines.reduce((n,r)=>n+r.dailyMinutes,0),monthlyMinutes:destinations.reduce((n,r)=>n+r.monthlyMinutes,0),totalCents:total,destinations};
}
export async function migrateCallingPlans(db){
 await db.query(`CREATE TABLE IF NOT EXISTS calling_plan_quotes(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,usage_json JSON NOT NULL,quote_json JSON NOT NULL,rate_hash CHAR(64) NOT NULL,expires_at DATETIME(3) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX calling_quote_owner(tenant_id,user_id,expires_at)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS custom_calling_plans(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,quote_id CHAR(36) NOT NULL,request_key CHAR(36) NOT NULL,quote_json JSON NOT NULL,budget_cents BIGINT NOT NULL,funding_cents BIGINT NOT NULL,invoice_id CHAR(36) NULL UNIQUE,status VARCHAR(24) NOT NULL,starts_at DATETIME(3) NULL,ends_at DATETIME(3) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),UNIQUE KEY calling_plan_once(tenant_id,user_id,request_key),UNIQUE KEY calling_quote_once(quote_id),INDEX calling_plan_owner(tenant_id,user_id,created_at)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS calling_plan_funding(plan_id CHAR(36) PRIMARY KEY,invoice_id CHAR(36) NOT NULL UNIQUE,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,amount_cents BIGINT NOT NULL,balance_after_cents BIGINT NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB`);
}
export async function quoteCallingPlan(db,user,input){
 const usage=validatePlanUsage(input),identity=assignedIdentity(loadPolicy(),user.tenant_id,user.id),provider=identity?.provider||'flowroute';
 const policies=provider==='flowroute'?[]:await loadTelecomPolicies(db,user.tenant_id),lines=[];
 for(const row of usage){
  const destination=row.sampleNumber.slice(1)||row.callingCode;
  const rates=(await db.query(`SELECT r.prefix,r.destination,r.cost_usd_per_minute,r.price_usd_per_minute,r.first_interval,r.sub_interval,r.deck_id
   FROM carrier_rate_rows r JOIN carrier_rate_decks d ON d.id=r.deck_id
   WHERE d.tenant_id=$1 AND d.provider=$2 AND d.active=TRUE AND r.effective_at<=UTC_TIMESTAMP()
   AND ($3 LIKE CONCAT(r.prefix,'%') OR ($4=TRUE AND r.prefix LIKE CONCAT($3,'%')))
   ORDER BY CHAR_LENGTH(r.prefix) DESC,r.effective_at DESC,r.deck_id`,[user.tenant_id,provider,destination,!row.sampleNumber])).rows;
  if(!rates.length)throw Error('No current selling rate for '+row.country+'; contact support to populate rates');
  const unique=[...new Map(rates.slice().reverse().map(r=>[r.prefix,r])).values()];
  const candidates=row.sampleNumber?[rates[0]]:unique;
  const priced=candidates.map(r=>{
   const override=selectPolicyRate(policies,{userId:user.id,callerId:identity?.callerId,destination:row.sampleNumber?destination:r.prefix});
   return {prefix:r.prefix,route:r.destination,sellingRate:provider==='flowroute'?flowrouteCustomerRate(r.cost_usd_per_minute):String(override?.data.rate??r.price_usd_per_minute),firstInterval:Number(override?.data.first??r.first_interval),subInterval:Number(override?.data.step??r.sub_interval)};
  });
  const selected=priced.reduce((a,b)=>rateMicros(b.sellingRate)>rateMicros(a.sellingRate)?b:a);
  lines.push({...row,...selected,rateBasis:row.sampleNumber?'Example number, longest matching prefix':'Highest listed selling rate for this calling code'});
 }
 const quote={...calculatePlan(lines),provider,estimate:true,note:'30-day prepaid calling budget. Actual calls use live destination rates and per-call billing intervals. This is not unlimited service or a country restriction. Existing subscription and calling permissions remain required.'};
 return {usage,quote,rateHash:digest(quote)};
}
export async function createCallingPlan(pool,user,input){
 if(!uuid(input?.quoteId)||!uuid(input?.requestKey)||input.acceptTerms!==true||(!Number.isSafeInteger(input.expectedTotalCents)||!Number.isSafeInteger(input.expectedFundingCents)))throw Error('Current quote, expected total, request ID and terms acceptance required');
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const saved=(await db.query('SELECT * FROM calling_plan_quotes WHERE id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE',[input.quoteId,user.tenant_id,user.id])).rows[0];
  if(!saved)throw Error('Quote unavailable');
  const previous=(await db.query('SELECT id,quote_id,invoice_id,status,funding_cents FROM custom_calling_plans WHERE tenant_id=$1 AND user_id=$2 AND (request_key=$3 OR quote_id=$4)',[user.tenant_id,user.id,input.requestKey,input.quoteId])).rows[0];
  if(previous){if(previous.quote_id!==input.quoteId)throw Error('Request ID belongs to another quote');await db.query('COMMIT');return {id:previous.id,invoiceId:previous.invoice_id,status:previous.status,fundingCents:Number(previous.funding_cents),duplicate:true};}
  if(new Date(saved.expires_at).getTime()<=Date.now())throw Error('Quote expired; calculate again');
  const current=await quoteCallingPlan(db,user,{destinations:json(saved.usage_json)});
  if(current.rateHash!==saved.rate_hash||current.quote.totalCents!==input.expectedTotalCents)throw Error('Rates changed; calculate and accept a new quote');
  const account=(await db.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[user.id,user.tenant_id])).rows[0];
  if(account&&account.currency!=='USD')throw Error('USD wallet required');
  const balance=Number(account?.balance_cents||0);if(!Number.isSafeInteger(balance)||balance<0)throw Error('Invalid wallet balance');
  const funding=Math.max(0,current.quote.totalCents-balance),id=randomUUID(),invoiceId=funding?randomUUID():null,now=new Date(),ends=new Date(now.getTime()+planDays*86400000);
  if(funding!==input.expectedFundingCents)throw Error('Wallet balance changed; calculate again to confirm the new funding amount');
  if(funding)await db.query("INSERT INTO invoices(id,user_id,description,amount_cents,currency,status) VALUES($1,$2,$3,$4,'USD','unpaid')",[invoiceId,user.id,'Custom calling plan wallet funding '+id,funding]);
  await db.query('INSERT INTO custom_calling_plans(id,tenant_id,user_id,quote_id,request_key,quote_json,budget_cents,funding_cents,invoice_id,status,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[id,user.tenant_id,user.id,input.quoteId,input.requestKey,JSON.stringify(current.quote),current.quote.totalCents,funding,invoiceId,funding?'awaiting_payment':'active',funding?null:now,funding?null:ends]);
  await db.query('COMMIT');return {id,invoiceId,status:funding?'awaiting_payment':'active',fundingCents:funding,budgetCents:current.quote.totalCents,existingBalanceCents:balance};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
// Only authoritative paid gateway attempts may credit new calling funds. GET,
// browser redirects and wallet-paid invoices cannot serve as payment evidence.
export async function creditCallingPlan(pool,planId){
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const ref=(await db.query('SELECT invoice_id FROM custom_calling_plans WHERE id=$1',[planId])).rows[0];
  if(!ref?.invoice_id){await db.query('ROLLBACK');return false;}
  const invoice=(await db.query('SELECT id,user_id,status,amount_cents,currency FROM invoices WHERE id=$1 FOR UPDATE',[ref.invoice_id])).rows[0];
  const plan=(await db.query('SELECT * FROM custom_calling_plans WHERE id=$1 FOR UPDATE',[planId])).rows[0];
  if(!plan||plan.status!=='awaiting_payment'||invoice?.status!=='paid'||invoice.user_id!==plan.user_id||invoice.currency!=='USD'||Number(invoice.amount_cents)!==Number(plan.funding_cents)){await db.query('ROLLBACK');return false;}
  const evidence=(await db.query("SELECT id FROM payment_attempts WHERE invoice_id=$1 AND tenant_id=$2 AND user_id=$3 AND status='paid' AND currency='USD' AND amount_cents=$4 AND provider IN ('stripe','paystack','flutterwave') LIMIT 1",[invoice.id,plan.tenant_id,plan.user_id,plan.funding_cents])).rows[0];
  const walletPayment=(await db.query('SELECT id FROM wallet_purchases WHERE invoice_id=$1',[invoice.id])).rows[0];
  const prior=(await db.query('SELECT plan_id FROM calling_plan_funding WHERE plan_id=$1',[plan.id])).rows[0];
  if(!evidence||walletPayment||prior){await db.query('ROLLBACK');return false;}
  await db.query('INSERT IGNORE INTO wallet_accounts(user_id,tenant_id,balance_cents) VALUES($1,$2,0)',[plan.user_id,plan.tenant_id]);
  const wallet=(await db.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[plan.user_id,plan.tenant_id])).rows[0];
  const after=Number(wallet?.balance_cents)+Number(plan.funding_cents);
  if(wallet?.currency!=='USD'||!Number.isSafeInteger(after)||after<1)throw Error('Wallet funding reconciliation required');
  await db.query('UPDATE wallet_accounts SET balance_cents=$1 WHERE user_id=$2 AND tenant_id=$3',[after,plan.user_id,plan.tenant_id]);
  await db.query('INSERT INTO calling_plan_funding(plan_id,invoice_id,tenant_id,user_id,amount_cents,balance_after_cents) VALUES($1,$2,$3,$4,$5,$6)',[plan.id,invoice.id,plan.tenant_id,plan.user_id,plan.funding_cents,after]);
  await db.query("UPDATE custom_calling_plans SET status='active',starts_at=UTC_TIMESTAMP(3),ends_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 DAY) WHERE id=$1 AND status='awaiting_payment'",[plan.id]);
  await db.query('COMMIT');return true;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export function startCallingPlanFunding(pool){
 let stopped=false,timer;
 async function tick(){try{const pending=(await pool.query("SELECT p.id FROM custom_calling_plans p JOIN invoices i ON i.id=p.invoice_id AND i.status='paid' WHERE p.status='awaiting_payment' ORDER BY p.created_at LIMIT 100")).rows;for(const p of pending)await creditCallingPlan(pool,p.id);}catch(e){console.error('Calling plan funding pending',e.code||e.name);}finally{if(!stopped){timer=setTimeout(tick,15000);timer.unref?.();}}}
 void tick();return()=>{stopped=true;clearTimeout(timer);};
}
export async function handleCallingPlans({req,res,path,user,pool,send,readJson}){
 if(!user?.features?.billing)return send(res,403,{error:'Billing access required'});
 res.setHeader('Cache-Control','no-store');
 try{
  if(path==='/api/billing/calling-plans/countries'&&req.method==='GET')return send(res,200,{days:planDays,countries:Object.entries(countries).map(([country,c])=>({country,callingCode:c.code,exampleRequired:Object.values(countries).filter(x=>x.code===c.code).length>1}))});
  if(path==='/api/billing/calling-plans/quote'&&req.method==='POST'){
   const result=await quoteCallingPlan(pool,user,await readJson(req)),id=randomUUID(),expires=new Date(Date.now()+600000);
   await pool.query('INSERT INTO calling_plan_quotes(id,tenant_id,user_id,usage_json,quote_json,rate_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,user.tenant_id,user.id,JSON.stringify(result.usage),JSON.stringify(result.quote),result.rateHash,expires]);
   const wallet=(await pool.query('SELECT balance_cents,currency FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows[0];
   const balance=wallet?.currency==='USD'?Number(wallet.balance_cents):0;
   return send(res,200,{quoteId:id,expiresAt:expires,...result.quote,existingBalanceCents:balance,fundingCents:Math.max(0,result.quote.totalCents-balance)});
  }
  if(path==='/api/billing/calling-plans'&&req.method==='POST')return send(res,201,await createCallingPlan(pool,user,await readJson(req)));
  if(path==='/api/billing/calling-plans'&&req.method==='GET'){
   const rows=(await pool.query('SELECT id,quote_json,budget_cents,funding_cents,invoice_id,status,starts_at,ends_at,created_at FROM custom_calling_plans WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 50',[user.tenant_id,user.id])).rows;
   return send(res,200,{plans:rows.map(r=>({...r,quote:json(r.quote_json),quote_json:undefined,status:r.status==='active'&&new Date(r.ends_at)<new Date()?'period_ended':r.status})),note:'Budgets share your calling wallet. Funds are not charged a second time or reserved per country. Calls use existing live billing; unused wallet credit remains available after the planning period.'});
  }
  return send(res,405,{error:'Unsupported calling plan operation'});
 }catch(e){if(e.code){console.error('Calling plan operation failed',e.code);return send(res,409,{error:'Plan operation unavailable or busy; retry with the same request ID'});}return send(res,409,{error:e.message});}
}
