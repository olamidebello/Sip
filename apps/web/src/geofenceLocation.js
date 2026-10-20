export function setupGeofenceLocation({document,request}){
 const $=id=>document.getElementById(id),form=$('geofence-zone-add'),status=$('geofence-admin-status');
 function center(latitude,longitude){form.elements.latitude.value=latitude;form.elements.longitude.value=longitude;if(!form.elements.radiusMeters.value)form.elements.radiusMeters.value=1000;status.textContent='Center selected. Set radius (1–100,000 meters), add the zone, then save the policy.';}
 $('geofence-use-location').onclick=()=>{
  if(!document.defaultView.navigator.geolocation){status.textContent='Device location unavailable. Enter coordinates.';return;}
  status.textContent='Requesting device location…';
  document.defaultView.navigator.geolocation.getCurrentPosition(p=>center(p.coords.latitude,p.coords.longitude),()=>{status.textContent='Location unavailable or permission denied. Enter coordinates or an address.';},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
 };
 $('geofence-find-address').onclick=async()=>{const button=$('geofence-find-address');button.disabled=true;$('geofence-address-results').replaceChildren();
  try{const data=await request('/api/admin/geofence/address',{address:$('geofence-address').value});
   for(const result of data.results){const li=document.createElement('li'),select=document.createElement('button');select.type='button';select.textContent=result.label;select.onclick=()=>center(result.latitude,result.longitude);li.append(select);$('geofence-address-results').append(li);}
   status.textContent=data.results.length?'Select the matching address.':'No address found. Try a more complete address or enter coordinates.';
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
 };
}
