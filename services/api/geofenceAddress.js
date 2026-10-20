export async function handleGeofenceAddress({req,res,user,send,readJson,fetchImpl=fetch,endpoint=process.env.GEOFENCE_GEOCODER_URL}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method!=='POST')return send(res,405,{error:'POST required'});
 const {address}=await readJson(req);
 if(typeof address!=='string'||address.trim().length<3||address.length>300)return send(res,400,{error:'Enter an address between 3 and 300 characters'});
 if(!endpoint)return send(res,503,{error:'Address lookup is not configured. Enter coordinates or use your current location.'});
 try{
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.hostname==='nominatim.openstreetmap.org')throw Error('Unsupported geocoder');
  url.searchParams.set('q',address.trim());url.searchParams.set('format','jsonv2');url.searchParams.set('limit','5');
  const response=await fetchImpl(url,{headers:{Accept:'application/json','User-Agent':'Olamide-Geofence/1.0'},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Lookup unavailable');
  const data=await response.json();if(!Array.isArray(data))throw Error('Invalid lookup');
  const results=data.slice(0,5).filter(x=>x.lat!==''&&x.lon!==''&&Number.isFinite(Number(x.lat))&&Math.abs(Number(x.lat))<=90&&Number.isFinite(Number(x.lon))&&Math.abs(Number(x.lon))<=180).map(x=>({latitude:Number(x.lat),longitude:Number(x.lon),label:String(x.display_name||'Location').slice(0,500)}));
  return send(res,200,{results});
 }catch{return send(res,502,{error:'Address lookup unavailable. Use coordinates or retry later.'});}
}
