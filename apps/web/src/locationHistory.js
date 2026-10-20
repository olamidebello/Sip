export function setupLocationHistory({document,get,request,geolocation=()=>document.defaultView.navigator.geolocation}){
 const panel=document.getElementById('location-history-settings'),list=document.getElementById('location-history-list'),status=document.getElementById('location-history-status');
 const save=document.getElementById('location-history-save'),clear=document.getElementById('location-history-clear'),refresh=document.getElementById('location-history-refresh');
 let owner=null,generation=0;
 async function load(){const token=generation;const data=await get('/api/account/location-history');if(token!==generation||!owner)return;save.disabled=data.policy?.enabled===false;if(data.policy?.enabled===false)status.textContent='Location-history saving is disabled by the administrator.';list.replaceChildren();for(const entry of data.entries||[]){const row=document.createElement('li');row.textContent=`${new Date(entry.recordedAt).toLocaleString()} · ${Number(entry.latitude).toFixed(5)}, ${Number(entry.longitude).toFixed(5)} · accuracy ${Math.round(entry.accuracyMeters)} m`;list.append(row);}if(!list.children.length){const row=document.createElement('li');row.textContent='No saved locations. Use Save current location to add your first entry.';list.append(row);}}
 refresh.onclick=()=>load().catch(error=>status.textContent=error.message);
 save.onclick=async()=>{if(!owner)return;const token=generation;save.disabled=true;status.textContent='Waiting for location permission…';try{
 const geo=geolocation();if(!geo)throw Error('Location is unavailable on this device');
 const position=await new Promise((resolve,reject)=>geo.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));
 if(token!==generation||!owner)return;
 const {latitude,longitude,accuracy}=position.coords;
 await request('/api/account/location-history',{consent:true,latitude,longitude,accuracyMeters:accuracy});
 if(token!==generation)return;await load();status.textContent='Current location saved to your account.';
 }catch(error){if(token===generation)status.textContent=error.code===1?'Location permission denied. Allow location for this site in browser settings, then try again.':error.message||'Location unavailable';}finally{if(token===generation)save.disabled=false;}};
 clear.onclick=async()=>{if(!owner)return;const token=generation;clear.disabled=true;try{await request('/api/account/location-history',{},'DELETE');if(token!==generation)return;await load();status.textContent='Location history cleared.';}catch(error){if(token===generation)status.textContent=error.message;}finally{if(token===generation)clear.disabled=false;}};
 return {async start(user){generation++;owner=user;panel.hidden=false;save.disabled=false;clear.disabled=false;status.textContent='';list.replaceChildren();try{await load();}catch(error){status.textContent=error.message;}},stop(){generation++;owner=null;panel.hidden=true;list.replaceChildren();status.textContent='';}};
}
