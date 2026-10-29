// Indicative display conversion only. Call charging remains in its existing currency.
export const FX_SOURCE='https://tradenaira.com/wp-json/tn/v1/rates';
export const FX_ATTRIBUTION='https://tradenaira.com/rates-api/';
export const FX_INTERVAL=30*60*1000,FX_MAX_AGE=36*60*60*1000;
export const ICN_NGN=Object.freeze([{category:'GSM networks',buy:4.45,sell:8},{category:'Other networks',buy:5.25,sell:10}]);
export function parseParallelFx(value,now=Date.now()){
 const rate=value?.parallel?.USD;
 const raw=value?.timestamp??value?.updated_at??value?.last_updated??value?.updated??value?.as_of;
 const observed=Date.parse(raw);
 if(typeof rate!=='number'||!Number.isFinite(rate)||rate<1||rate>1000000)throw Error('Invalid parallel USD/NGN rate');
 if(!Number.isFinite(observed)||observed>now+300000||now-observed>FX_MAX_AGE)throw Error('Parallel quote timestamp is missing or stale');
 return {ngnPerUsd:rate,observedAt:new Date(observed).toISOString()};
}
export function fxDisplay(quote,{admin=false,now=Date.now()}={}){
 const fresh=!!quote&&Number.isFinite(Number(quote.ngn_per_usd))&&Number(quote.ngn_per_usd)>0&&now-new Date(quote.observed_at).getTime()<=FX_MAX_AGE&&new Date(quote.observed_at).getTime()<=now+300000;
 const usd=n=>fresh?Math.round(n/Number(quote.ngn_per_usd)*1e6)/1e6:null;
 return {currency:'USD',baseCurrency:'NGN',market:'parallel',indicative:true,available:fresh,stale:!!quote&&!fresh,ngnPerUsd:fresh?Number(quote.ngn_per_usd):null,observedAt:quote?.observed_at||null,checkedAt:quote?.checked_at||null,source:'tradeNAIRA',sourceUrl:FX_ATTRIBUTION,refreshMinutes:30,note:'USD display estimate only. ICN NGN prices are unchanged; live charging requires a separately commissioned currency-aware tariff.',rates:ICN_NGN.map(r=>({category:r.category,sellNgn:r.sell,sellUsd:usd(r.sell),...(admin?{buyNgn:r.buy,buyUsd:usd(r.buy)}:{})}))};
}
export async function migrateIcnFx(db){await db.query(`CREATE TABLE IF NOT EXISTS icn_display_fx(id TINYINT PRIMARY KEY,ngn_per_usd DECIMAL(18,6) NOT NULL,observed_at DATETIME(3) NOT NULL,checked_at DATETIME(3) NOT NULL) ENGINE=InnoDB`);}
export function createIcnFxSync(pool,{fetcher=globalThis.fetch,now=Date.now}={}){
 let busy=false,lastAttempt=-Infinity;
 return async function refresh(){if(busy||now()-lastAttempt<5*60000)return;busy=true;lastAttempt=now();let db,locked=false;
 try{db=await pool.connect();locked=Number((await db.query("SELECT GET_LOCK('olamide_icn_display_fx',0) AS acquired")).rows[0]?.acquired)===1;if(!locked)return;
 const current=(await db.query('SELECT checked_at FROM icn_display_fx WHERE id=1')).rows[0];if(current&&now()-new Date(current.checked_at).getTime()<FX_INTERVAL-1000)return;
 const response=await fetcher(FX_SOURCE,{redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json','User-Agent':'OlamideConnect-FX/1.0'}});if(!response.ok)throw Error('FX source unavailable');
 const text=await response.text();if(text.length>65536)throw Error('FX response too large');const quote=parseParallelFx(JSON.parse(text),now());
 await db.query('INSERT INTO icn_display_fx(id,ngn_per_usd,observed_at,checked_at) VALUES(1,$1,$2,$3) ON DUPLICATE KEY UPDATE ngn_per_usd=VALUES(ngn_per_usd),observed_at=VALUES(observed_at),checked_at=VALUES(checked_at)',[quote.ngnPerUsd,quote.observedAt.slice(0,23).replace('T',' '),new Date(now()).toISOString().slice(0,23).replace('T',' ')]);
 }catch{console.warn('ICN_FX_REFRESH unavailable; last validated quote retained');}finally{if(locked)await db.query("SELECT RELEASE_LOCK('olamide_icn_display_fx')").catch(()=>{});db?.release();busy=false;}};
}
export function startIcnFx(pool){const refresh=createIcnFxSync(pool);void refresh();const timer=setInterval(()=>void refresh(),FX_INTERVAL);timer.unref?.();return()=>clearInterval(timer);}
export async function handleIcnFx({req,res,user,pool,send}){if(req.method!=='GET')return send(res,405,{error:'GET required'});res.setHeader('Cache-Control','no-store');const quote=(await pool.query('SELECT ngn_per_usd,observed_at,checked_at FROM icn_display_fx WHERE id=1')).rows[0];return send(res,200,fxDisplay(quote,{admin:user.role==='super_admin'}));}
