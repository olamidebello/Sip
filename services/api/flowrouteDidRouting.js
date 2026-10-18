import {BlockList,isIP} from 'node:net';
export const flowrouteNetworks=['34.210.91.112/28','34.226.36.32/28'];
export function carrierSource(ip){const list=new BlockList();for(const cidr of flowrouteNetworks){const [address,bits]=cidr.split('/');list.addSubnet(address,Number(bits),'ipv4');}return isIP(ip)===4&&list.check(ip,'ipv4');}
export function didNumber(value){if(typeof value!=='string')return null;const n=value.replace(/^\+/,'');return /^[1-9][0-9]{7,14}$/.test(n)?'+'+n:null;}
export async function didOwner(pool,tenant,number){
 const normalized=didNumber(number);if(!normalized)return null;
 const result=await pool.query(`SELECT DISTINCT u.id AS user_id FROM (
 SELECT user_id FROM flowroute_sms_numbers WHERE tenant_id=$1 AND number_e164=$2 AND enabled=TRUE
 UNION SELECT user_id FROM inhouse_dids WHERE tenant_id=$1 AND number_e164=$2 AND status='assigned' AND user_id IS NOT NULL
 UNION SELECT q.user_id FROM did_quotes q JOIN users qu ON qu.id=q.user_id WHERE qu.tenant_id=$1 AND q.provider='flowroute' AND q.number_e164 IN ($2,SUBSTRING($2,2)) AND q.status='fulfilled'
 ) a JOIN users u ON u.id=a.user_id AND u.tenant_id=$1 AND u.status='active' JOIN tenants t ON t.id=u.tenant_id AND t.status='active' LIMIT 2`,[tenant,normalized]);
 return result.rows.length===1?result.rows[0]:null;
}
export async function inboundDid(pool,data){
 if(!carrierSource(data.sourceIp))return [403,{error:'Carrier source unavailable'}];
 const number=didNumber(data.destination);if(!number)return [400,{error:'Invalid DID'}];
 const tenant=process.env.FLOWROUTE_WEBHOOK_TENANT_ID||'00000000-0000-4000-8000-000000000000';
 const owner=await didOwner(pool,tenant,number);if(!owner)return [404,{error:'DID unavailable or ownership ambiguous'}];
 const rows=await pool.query("SELECT username,domain FROM sip_accounts WHERE tenant_id=$1 AND user_id=$2 AND status='active' ORDER BY created_at LIMIT 2",[tenant,owner.user_id]);
 const sip=rows.rows[0];if(!sip||!/^[a-z0-9+_.-]{1,64}$/i.test(sip.username)||!/^[a-z0-9.-]{1,253}$/i.test(sip.domain))return [404,{error:'DID SIP account unavailable'}];
 return [200,{route:'inbound',username:sip.username,domain:sip.domain,did:number}];
}

export async function flowrouteApi(pool,tenant,path,{method='GET',body,fetcher=fetch}={}){
 const {providerCredentials}=await import('./providerCredentials.js');const saved=await providerCredentials(pool,tenant,'flowroute');
 if(saved?.disabled)throw Error('Flowroute credentials disabled');
 const key=saved?.accessKey||process.env.FLOWROUTE_ACCESS_KEY,secret=saved?.secretKey||process.env.FLOWROUTE_SECRET_KEY;
 if(!key||!secret)throw Error('Configure Flowroute API credentials');
 const r=await fetcher('https://api.flowroute.com'+path,{method,headers:{Authorization:'Basic '+Buffer.from(key+':'+secret).toString('base64'),'Content-Type':'application/vnd.api+json',Accept:'application/vnd.api+json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Flowroute configuration request rejected (HTTP '+r.status+')');return r.status===204?null:r.json();
}
export async function provisionDid(pool,user,input,fetcher=fetch){
 const number=didNumber(input.number);if(!number||!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(process.env.PUBLIC_ORIGIN||''))throw Error('DID and public HTTPS PUBLIC_ORIGIN required');
 if((process.env.FLOWROUTE_WEBHOOK_TOKEN||'').length<32)throw Error('Webhook secret is not configured');
 const assigned=(await pool.query('SELECT user_id FROM flowroute_sms_numbers WHERE tenant_id=$1 AND number_e164=$2 AND enabled=TRUE',[user.tenant_id,number])).rows[0];if(!assigned)throw Error('Assign and enable the DID first');
 const owner=await didOwner(pool,user.tenant_id,number);if(owner?.user_id!==assigned.user_id)throw Error('DID ownership conflicts; resolve assignments first');
 const call=(path,options={})=>flowrouteApi(pool,user.tenant_id,path,{...options,fetcher});
 await call('/v2/numbers/'+number.slice(1)); // Verifies the DID belongs to this carrier account before any write.
 const host=input.voiceHost;if(typeof host!=='string'||!/^([a-z0-9.-]+):5060$/i.test(host))throw Error('Voice host must be your SIP hostname or IP followed by :5060');
 const completed=[];
 try{
  for(const [kind,type] of [['sms','sms_callback'],['sms-dlr','sms_dlr_callback']]){
   await call('/v2/numbers/'+number.slice(1)+'/relationships/'+type,{method:'POST',body:{data:{attributes:{callback_url:process.env.PUBLIC_ORIGIN+'/api/webhooks/flowroute/'+process.env.FLOWROUTE_WEBHOOK_TOKEN+'/'+kind}}}});completed.push(kind);
  }
  // Host is explicitly supplied by the operator; never read arbitrary callback hosts or provider response links.
  const routes=await call('/v2/routes?limit=200');let route=(routes.data||[]).find(r=>r.attributes?.route_type?.toLowerCase()==='host'&&r.attributes.value===host);
  if(!route)route=(await call('/v2/routes',{method:'POST',body:{data:{type:'route',attributes:{route_type:'host',value:host,alias:'Olamide inbound '+host}}}})).data;
  if(!/^\d+$/.test(String(route?.id)))throw Error('Invalid route acknowledgement');
  await call('/v2/numbers/'+number.slice(1)+'/relationships/primary_route',{method:'PATCH',body:{data:{type:'route',id:String(route.id)}}});completed.push('voice');
  return {number,completed};
 }catch(e){throw Error('Configured: '+(completed.join(', ')||'none')+'. '+e.message);}
}
