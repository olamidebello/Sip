import {randomUUID} from 'node:crypto';
import {seal,unseal} from './providerCredentials.js';
export const quoteLifetimeMs=10*60*1000;
export function formatMinorUnits(amount){
 if(!Number.isSafeInteger(amount)||amount<0)throw Error('Invalid payment amount');
 const value=BigInt(amount);return `${value/100n}.${String(value%100n).padStart(2,'0')}`;
}
const maximumRateAgeMs=90*60*1000;
const feedUrl='https://abokiforexpaid.uc.r.appspot.com/_ah/api/forex/v1/rates';
const key=()=>/^[a-f0-9]{64}$/i.test(process.env.PAYMENT_CONFIG_KEY||'')?Buffer.from(process.env.PAYMENT_CONFIG_KEY,'hex'):null;
export function minorUnits(value){
 const text=String(value),m=/^(\d+)(?:\.(\d+))?$/.exec(text);
 if(!m||m[2]?.slice(2).replace(/0/g,''))throw Error('Invalid payment amount');
 const result=BigInt(m[1])*100n+BigInt((m[2]||'').slice(0,2).padEnd(2,'0'));
 if(result>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Payment amount too large');
 return Number(result);
}
export function convertUsdCents(cents,rate){
 if(!Number.isSafeInteger(cents)||cents<1)throw Error('Invalid invoice amount');
 const m=/^(\d{1,6})(?:\.(\d{1,6}))?$/.exec(String(rate));
 if(!m)throw Error('Invalid exchange rate');
 const scaled=BigInt(m[1])*1000000n+BigInt((m[2]||'').padEnd(6,'0'));
 if(scaled<=0n)throw Error('Invalid exchange rate');
 const result=(BigInt(cents)*scaled+500000n)/1000000n;
 if(result<1n||result>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Converted amount out of range');
 return Number(result);
}
export function parseParallelRate(data,now=Date.now()){
 const stamp=Date.parse(data?.timestamp);
 if(data?.baseCurrency!=='NGN'||data?.rateType!=='black_market'||data?.source!=='abokiforex.app'||!Number.isFinite(stamp)||stamp>now+60000||now-stamp>maximumRateAgeMs)throw Error('Fresh parallel-market rate unavailable');
 const rate=data.rates?.USD?.sell;
 convertUsdCents(100,rate);
 return {rate:String(rate),source:'abokiforex.app',rateSide:'sell',rateAt:new Date(stamp)};
}
export async function migrateNairaPayments(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS naira_fx_config(tenant_id CHAR(36) PRIMARY KEY,ciphertext BLOB NOT NULL,updated_by CHAR(36) NOT NULL,FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS naira_payment_quotes(
 id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,invoice_id CHAR(36) NOT NULL,
 base_amount_cents BIGINT UNSIGNED NOT NULL,base_currency CHAR(3) NOT NULL,charge_amount_cents BIGINT UNSIGNED NOT NULL,
 rate DECIMAL(18,6) NOT NULL,source VARCHAR(64) NOT NULL,rate_side VARCHAR(12) NOT NULL,rate_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL,expires_at DATETIME(3) NOT NULL,attempt_id CHAR(36) NULL UNIQUE,
 FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,INDEX naira_quotes_owner(tenant_id,user_id,created_at)) ENGINE=InnoDB`);
}
export async function handleNairaConfig({req,res,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method==='GET'){
  const row=(await pool.query('SELECT tenant_id FROM naira_fx_config WHERE tenant_id=$1',[user.tenant_id])).rows[0];
  return send(res,200,{configured:!!row,encryptionReady:!!key(),source:'abokiforex.app',rateSide:'sell',quoteMinutes:10,maximumRateAgeMinutes:90,ngnProvider:'flutterwave'});
 }
 if(req.method!=='PUT')return send(res,405,{error:'GET or PUT required'});
 const b=await readJson(req);
 if(!key()||typeof b.apiKey!=='string'||!b.apiKey.trim()||b.apiKey.length>512||/\s/.test(b.apiKey))return send(res,400,{error:'Valid rate-feed API key and PAYMENT_CONFIG_KEY required'});
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  await db.query('INSERT INTO naira_fx_config(tenant_id,ciphertext,updated_by) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE ciphertext=VALUES(ciphertext),updated_by=VALUES(updated_by)',[user.tenant_id,seal({apiKey:b.apiKey},key(),user.tenant_id,'ngn-fx'),user.id]);
  await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'naira_rate_feed_updated')",[randomUUID(),user.tenant_id,user.id]);
  await db.query('COMMIT');return send(res,200,{saved:true});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function createNairaQuote(pool,invoice,user,{fetchImpl=fetch,now=Date.now()}={}){
 const base=Number(invoice.amount_cents);
 if(!Number.isSafeInteger(base)||base<1||!['USD','NGN'].includes(invoice.currency))throw Error('USD or NGN invoice required');
 let fx={rate:'1',source:'native-NGN',rateSide:'none',rateAt:new Date(now)};
 if(invoice.currency==='USD'){
  const row=(await pool.query('SELECT ciphertext FROM naira_fx_config WHERE tenant_id=$1',[user.tenant_id])).rows[0];
  if(!row||!key())throw Error('Configure the parallel-market rate feed first');
  const credentials=unseal(row.ciphertext,key(),user.tenant_id,'ngn-fx');
  const response=await fetchImpl(feedUrl,{headers:{'X-API-Key':credentials.apiKey,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Parallel-market rate feed unavailable');
  fx=parseParallelRate(await response.json(),now);
 }
 const amount=invoice.currency==='NGN'?base:convertUsdCents(base,fx.rate);
 const quote={id:randomUUID(),amountCents:amount,currency:'NGN',baseAmountCents:base,baseCurrency:invoice.currency,...fx,createdAt:new Date(now),expiresAt:new Date(now+quoteLifetimeMs)};
 await pool.query('INSERT INTO naira_payment_quotes(id,tenant_id,user_id,invoice_id,base_amount_cents,base_currency,charge_amount_cents,rate,source,rate_side,rate_at,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[quote.id,user.tenant_id,user.id,invoice.id,base,invoice.currency,amount,fx.rate,fx.source,fx.rateSide,fx.rateAt,quote.createdAt,quote.expiresAt]);
 return quote;
}
