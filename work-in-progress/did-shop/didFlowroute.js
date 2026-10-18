import {providerCredentials} from './providerCredentials.js';
export async function flowrouteRequest(pool,tenant,path,{method='GET',body,fetchImpl=fetch}={}){
 if(!/^\/(numbers|routes)(\/|\?|$)/.test(path))throw Error('Invalid Flowroute API path');
 const stored=await providerCredentials(pool,tenant,'flowroute');if(stored?.disabled)throw Error('Flowroute credentials are disabled');
 const access=stored?.accessKey||process.env.FLOWROUTE_ACCESS_KEY,secret=stored?.secretKey||process.env.FLOWROUTE_SECRET_KEY;if(!access||!secret)throw Error('Flowroute API credentials are not configured');
 const r=await fetchImpl('https://api.flowroute.com/v2'+path,{method,headers:{Authorization:'Basic '+Buffer.from(access+':'+secret).toString('base64'),Accept:'application/vnd.api+json',...(body?{'Content-Type':'application/vnd.api+json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok){const e=Error('Flowroute operation unavailable ('+r.status+')');e.providerStatus=r.status;throw e;}
 return r.status===204?null:await r.json();
}
export function retailCents(value){const s=String(value);if(!/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(s))throw Error('Invalid provider cost');const [a,b='']=s.split('.'),micros=BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));const cents=Number((micros*13n+99999n)/100000n);if(!Number.isSafeInteger(cents)||cents>10000000)throw Error('Price exceeds limit');return cents;}
export function sellOffer(item){const a=item.attributes||{},number='+'+String(a.value||item.id).replace(/^\+/,'');if(!/^\+[1-9]\d{7,14}$/.test(number))throw Error('Invalid provider number');const setupCents=retailCents(a.setup_cost),monthlyCents=retailCents(a.monthly_cost);return {number,setupCents,monthlyCents,dueNowCents:setupCents+monthlyCents,currency:'USD'};}
export async function searchFlowroute(pool,tenant,{country,state,offset=0},options={}){const q=new URLSearchParams({iso_country:country,limit:'20',offset:String(offset),number_type:'longcode'});if(['US','CA'].includes(country))q.set('state',state.toLowerCase());const data=await flowrouteRequest(pool,tenant,'/numbers/available?'+q,options);return {items:data.data||[],hasMore:!!data.links?.next};}
