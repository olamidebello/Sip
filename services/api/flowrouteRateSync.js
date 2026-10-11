import {importRateCsv} from './flowrouteRates.js';
const maxBytes=20*1024*1024;
export async function boundedText(response){
  if(!response.ok||Number(response.headers.get('content-length')||0)>maxBytes)throw Error('Rate source unavailable');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw Error('Rate source too large');parts.push(Buffer.from(value));}}
  finally{await reader.cancel();}
  return Buffer.concat(parts).toString('utf8');
}
export function rateDownloadUrl(html){
  const links=[...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]);
  const link=links.find(link=>/^https:\/\/flowroute\.com\/wp-content\/uploads\/\d{4}\/\d{2}\/flowroute_default_rate\.csv$/.test(link));
  if(!link)throw Error('Official rate download link unavailable');
  return link;
}
export async function fetchOfficialRates(fetcher=fetch){
  const options={redirect:'error',signal:AbortSignal.timeout(30000)};
  const html=await boundedText(await fetcher('https://flowroute.com/outbound-rates/',options));
  return boundedText(await fetcher(rateDownloadUrl(html),{...options,signal:AbortSignal.timeout(30000)}));
}
export async function syncRateDecks(pool,fetcher=fetch){
  const db=await pool.connect();let locked=false;
  try{
    locked=Number((await db.query("SELECT GET_LOCK('olamide-flowroute-rates',0) AS acquired")).rows[0]?.acquired)===1;
    if(!locked)return;
    const tenants=(await db.query("SELECT s.tenant_id,s.requested_by FROM flowroute_rate_sync s JOIN tenants t ON t.id=s.tenant_id AND t.status='active' WHERE s.enabled=TRUE AND s.next_check_at<=UTC_TIMESTAMP() LIMIT 20")).rows;
    if(!tenants.length)return;
    let csv;try{csv=await fetchOfficialRates(fetcher);}catch{
      for(const t of tenants)await db.query("UPDATE flowroute_rate_sync SET last_checked_at=UTC_TIMESTAMP(),last_error='Official rate download failed; prior deck preserved',next_check_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE tenant_id=$1",[t.tenant_id]);return;
    }
    for(const t of tenants){
      try{await importRateCsv(pool,t.tenant_id,t.requested_by,csv,{automatic:true});
        await db.query('UPDATE flowroute_rate_sync SET last_checked_at=UTC_TIMESTAMP(),last_success_at=UTC_TIMESTAMP(),last_error=NULL,next_check_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 6 HOUR) WHERE tenant_id=$1',[t.tenant_id]);
      }catch{await db.query("UPDATE flowroute_rate_sync SET last_checked_at=UTC_TIMESTAMP(),last_error='Rate validation or import failed; prior deck preserved',next_check_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE tenant_id=$1",[t.tenant_id]);}
    }
  }finally{if(locked)await db.query("SELECT RELEASE_LOCK('olamide-flowroute-rates')");db.release();}
}
export function startFlowrouteRateSync(pool){
  let running=false;
  const tick=async()=>{if(running)return;running=true;try{await syncRateDecks(pool);}catch{console.error('Flowroute rate sync failed');}finally{running=false;}};
  const timer=setInterval(tick,60000);timer.unref();return ()=>clearInterval(timer);
}
