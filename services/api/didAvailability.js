export function smoothDidRegionMatches(country,region=''){
 const area=String(region).trim().toLowerCase().replace(/^ng-/, '');
 return country==='NG'&&(!area||['kw','kwara','ilorin','kwara state','kwara (kw)'].includes(area));
}
const e164=v=>'+'+String(v||'').replace(/^\+/,''),validNumber=v=>/^\+[1-9]\d{7,14}$/.test(v);
export function validateDidSearch(input={}){const country=String(input.country||'').toUpperCase(),region=String(input.region||'').trim(),prefix=String(input.prefix||'').replace(/^\+/,''),provider=String(input.provider||'all'),page=Number(input.page||0);if(!/^[A-Z]{2}$/.test(country)||!/^[-\p{L}\p{N} .']{0,60}$/u.test(region)||!/^\d{0,15}$/.test(prefix)||!/^([a-z][a-z0-9-]{1,15}|all)$/.test(provider)||!Number.isInteger(page)||page<0||page>99)throw Error('Country, valid region, international number prefix and page required');return {country,region,prefix,provider,page};}
export function inventoryPage(provider,items,{total=null,hasMore=false,page=0}={}){const unique=new Map();for(const item of items){const number=e164(item.number);if(validNumber(number)&&!unique.has(number))unique.set(number,{...item,number});}return {provider,status:'ok',numbers:[...unique.values()],loaded:unique.size,total:Number.isSafeInteger(total)&&total>=unique.size?total:null,hasMore:!!hasMore,page,checkedAt:new Date().toISOString()};}
async function jsonGet(url,headers,fetcher){const r=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Provider inventory unavailable ('+r.status+')');return r.json();}
export async function remoteDidInventory(provider,q,c,fetcher=fetch){
 if(provider==='flowroute'){
  if(!c?.accessKey||!c?.secretKey)throw Error('Flowroute credentials required');
  if(q.region&&(!['US','CA'].includes(q.country)||!/^[a-z]{2}$/i.test(q.region)))throw Error('Flowroute region filtering requires a US state or Canadian province abbreviation; otherwise use an international number prefix');
  const p=new URLSearchParams({iso_country:q.country,limit:'20',offset:String(q.page*20)});if(q.prefix)p.set('starts_with','+'+q.prefix);if(q.region)p.set('state',q.region.toLowerCase());
  const data=await jsonGet('https://api.flowroute.com/v2/numbers/available?'+p,{Authorization:'Basic '+Buffer.from(c.accessKey+':'+c.secretKey).toString('base64'),Accept:'application/vnd.api+json'},fetcher);if(!Array.isArray(data.data))throw Error('Invalid Flowroute inventory response');
  return inventoryPage(provider,data.data.map(x=>({number:x.attributes?.value,inventoryId:x.id})),{hasMore:!!data.links?.next,page:q.page});
 }
 if(provider==='twilio'){
  if(!/^AC[a-f0-9]{32}$/i.test(c?.accountSid||''))throw Error('Twilio account credentials required');const pair=c.apiKeySid&&c.apiKeySecret?[c.apiKeySid,c.apiKeySecret]:[c.accountSid,c.authToken];if(!pair[1])throw Error('Twilio API secret required');
  if(q.region&&(!['US','CA'].includes(q.country)||!/^[a-z]{2}$/i.test(q.region)))throw Error('Twilio region filtering requires a US state or Canadian province abbreviation; otherwise use an international number prefix');
  const p=new URLSearchParams({PageSize:'20',Page:String(q.page),VoiceEnabled:'true'});if(q.region)p.set('InRegion',q.region.toUpperCase());if(q.prefix)p.set('Contains','+'+q.prefix+'*');
  const d=await jsonGet('https://api.twilio.com/2010-04-01/Accounts/'+c.accountSid+'/AvailablePhoneNumbers/'+q.country+'/Local.json?'+p,{Authorization:'Basic '+Buffer.from(pair.join(':')).toString('base64')},fetcher);if(!Array.isArray(d.available_phone_numbers))throw Error('Invalid Twilio inventory response');
  return inventoryPage(provider,d.available_phone_numbers.map(n=>({number:n.phone_number,area:n.locality||n.region||'',capabilities:n.capabilities,addressRequirements:n.address_requirements})),{hasMore:!!d.next_page_uri,page:q.page});
 }
 if(provider==='didww'){
  if(!c?.apiKey||!['production','sandbox'].includes(c.environment))throw Error('DIDWW environment and API key required');const base=c.environment==='production'?'https://api.didww.com/v3/':'https://sandbox-api.didww.com/v3/',headers={'Api-Key':c.apiKey,Accept:'application/vnd.api+json','X-DIDWW-Api-Version':'2026-04-16'};
  const countries=await jsonGet(base+'countries?'+new URLSearchParams({'filter[iso]':q.country}),headers,fetcher);const found=(countries.data||[]).filter(x=>x.attributes?.iso===q.country);if(found.length!==1)return inventoryPage(provider,[],{total:0,page:q.page});
  const p=new URLSearchParams({'filter[country.id]':found[0].id,'page[size]':'20','page[number]':String(q.page+1)});
  if(q.prefix)p.set('filter[number_contains]',q.prefix);
  if(q.region){const rp=new URLSearchParams({'filter[country.id]':found[0].id});rp.set(/^[a-z]{2}$/i.test(q.region)?'filter[iso]':'filter[name]',/^[a-z]{2}$/i.test(q.region)?q.country+'-'+q.region.toUpperCase():q.region);const regions=await jsonGet(base+'regions?'+rp,headers,fetcher);if(!Array.isArray(regions.data))throw Error('Invalid DIDWW region response');if(regions.data.length!==1)return inventoryPage(provider,[],{total:0,page:q.page});p.set('filter[region.id]',regions.data[0].id);}
  const d=await jsonGet(base+'available_dids?'+p,headers,fetcher);if(!Array.isArray(d.data))throw Error('Invalid DIDWW inventory response');const raw=d.data.map(n=>({number:n.attributes?.number,inventoryId:n.id}));const items=q.prefix?raw.filter(n=>e164(n.number).slice(1).startsWith(q.prefix)):raw;
  // DIDWW number_contains is broader than an international prefix. Its total is not a prefix total.
  return inventoryPage(provider,items,{total:q.prefix?null:d.meta?.total_count,hasMore:!!d.links?.next,page:q.page});
 }
 throw Error('No inventory adapter for this provider');
}
export async function aggregateDidInventory(names,search,load){const results=await Promise.all(names.map(async provider=>{try{return await load(provider,search);}catch{return {provider,status:'unavailable',numbers:[],loaded:0,total:null,hasMore:false,error:'Inventory unavailable or search filter unsupported. Check provider setup or refine the search.'};}}));return {search,providers:results,loaded:results.reduce((n,r)=>n+r.loaded,0),checkedAt:new Date().toISOString(),note:'Counts marked loaded describe this result page. Unavailable providers do not mean zero stock. Availability is rechecked by the existing order workflow; this search does not reserve or buy a number.'};}
export async function handleDidAvailability({req,res,user,pool,send,sessionHash}){
 if(req.method!=='GET')return send(res,405,{error:'Search is read-only'});if(!user?.features?.billing)return send(res,403,{error:'Billing access required'});res.setHeader('Cache-Control','no-store');
 let q;try{q=validateDidSearch(Object.fromEntries(new URL(req.url,'http://localhost').searchParams));}catch(e){return send(res,400,{error:e.message});}
 const [{providerOptions,providerAccess},{serviceLocationAccess},{geoCallingAccess},{providerCredentials}]=await Promise.all([import('./providerManager.js'),import('./locationPolicy.js'),import('./geoCalling.js'),import('./providerCredentials.js')]);
 const location=await serviceLocationAccess(pool,user.tenant_id,user.id,{sessionHash,requireSession:true});if(!location.allowed)return send(res,403,{error:location.reason});
 const options=await providerOptions(pool,user.tenant_id),names=q.provider==='all'?['smoothdid',...options.filter(p=>p.state==='enabled').map(p=>p.provider)]:[q.provider];
 const result=await aggregateDidInventory([...new Set(names)],q,async provider=>{
  if(provider==='smoothdid'){
   if(!smoothDidRegionMatches(q.country,q.region))return inventoryPage(provider,[],{total:0});
   const {handleSmoothDid}=await import('./smoothDid.js');let reply;const params=new URLSearchParams({q:q.prefix?'+'+q.prefix:''});await handleSmoothDid({req:{method:'GET',url:'/api/smoothdid/numbers?'+params},res,path:'/api/smoothdid/numbers',user,pool,sessionHash,send:(_,status,body)=>{reply={status,body};}});if(reply?.status!==200)throw Error('SmoothDID unavailable');return {...inventoryPage(provider,reply.body.numbers.map(n=>({number:n.number_e164,groupId:n.groupId}))),note:reply.body.numbers.length?'Up to 50 eligible SmoothDIDs shown. Refine the prefix for more specific results.':!reply.body.groups?.length?'No in-house DID groups are configured for this workspace. Super admin must provision inventory.':reply.body.groups.every(g=>!g.enabled)?'In-house DID marketplace sales are paused. Super admin must configure a monthly price and service areas, then enable group sales.':reply.body.groups.every(g=>!g.enabled||!g.access?.allowed)?'In-house DID groups are not available for this account or current service location. Refresh your location or contact the administrator.':'No purchasable in-house DIDs match this prefix. Check available inventory and existing assignments.'};
  }
  const option=options.find(p=>p.provider===provider);if(option?.state!=='enabled')throw Error('Provider not enabled');const access=await providerAccess(pool,user.tenant_id,provider);if(!access.allowed)throw Error('Provider unavailable');
  const geo=await geoCallingAccess(pool,{tenantId:user.tenant_id,userId:user.id,provider,checkCallerId:false,sessionHash});if(!geo.allowed)throw Error('Provider unavailable for user location');
  let c;if(provider==='twilio'){const [{hubSettings},{roleSettings}]=await Promise.all([import('./twilioHub.js'),import('./twilioRoles.js')]);const hub=await hubSettings(pool,user.tenant_id),roles=await roleSettings(pool,user.tenant_id);if(!hub?.enabled||!roles.did)throw Error('Twilio DID role disabled');c=hub.credentials;}else{c=await providerCredentials(pool,user.tenant_id,provider);if(c?.disabled)throw Error('Provider credentials disabled');if(provider==='flowroute')c={accessKey:c?.accessKey||process.env.FLOWROUTE_ACCESS_KEY,secretKey:c?.secretKey||process.env.FLOWROUTE_SECRET_KEY};if(provider==='didww')c={apiKey:c?.apiKey||process.env.DIDWW_API_KEY,environment:c?.environment||process.env.DIDWW_API_ENV};}
  return remoteDidInventory(provider,q,c);
 });for(const entry of result.providers)entry.displayName=entry.provider==='smoothdid'?'SmoothDID':options.find(p=>p.provider===entry.provider)?.displayName||entry.provider;return send(res,200,result);
}
