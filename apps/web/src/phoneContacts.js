export function normalizePhoneContacts(rows,{native=false}={}){
 const map=new Map();for(const row of rows||[]){
  const name=String(native?(row.name?.display||[row.name?.given,row.name?.family].filter(Boolean).join(' ')):row.name?.[0]||'').trim();
  const email=String(native?row.emails?.[0]?.address||'':row.email?.[0]||'').trim().toLowerCase();
  const phone=String(native?row.phones?.[0]?.number||'':row.tel?.[0]||'').trim();
  if((!email&&!phone)||(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))continue;
  if(email.length>254||phone.length>64)continue;map.set(email+'\0'+phone,{name:name.slice(0,160),email,phone});
 }return [...map.values()];
}
export function nativeContactsPlugin(window){const cap=window.Capacitor;if(!cap?.isNativePlatform?.())return null;return cap.Plugins?.Contacts||cap.registerPlugin?.('Contacts')||null;}
export async function choosePhoneContacts(window){
 const plugin=nativeContactsPlugin(window);
 if(plugin){const permission=await plugin.requestPermissions();if(!['granted','limited'].includes(permission.contacts))throw Error('Phone Contacts permission was not granted.');const result=await plugin.getContacts({projection:{name:true,emails:true,phones:true}});return normalizePhoneContacts(result.contacts,{native:true});}
 if(!window.navigator.contacts?.select)throw Error('Direct phone import is unavailable in this browser. Use the Olamide mobile app or import a vCard/CSV export.');
 return normalizePhoneContacts(await window.navigator.contacts.select(['name','email','tel'],{multiple:true}));
}
export async function saveContactBatches(rows,request,{valid=()=>true,onBatch=()=>{}}={}){
 if(!rows.length)throw Error('No contacts with email or phone were selected');if(rows.length>5000)throw Error('Import at most 5,000 contacts at a time');
 let processed=0;for(let offset=0;offset<rows.length;offset+=500){if(!valid())throw Error('Sign in again to continue importing');const batch=rows.slice(offset,offset+500);await request('/api/contacts/address-book',{contacts:batch});processed+=batch.length;onBatch(batch);}
 return {processed};
}
export async function grantedPhoneContacts(window){const plugin=nativeContactsPlugin(window);if(!plugin)return null;const permission=await plugin.checkPermissions();if(!['granted','limited'].includes(permission.contacts))return null;const result=await plugin.getContacts({projection:{name:true,emails:true,phones:true}});return normalizePhoneContacts(result.contacts,{native:true});}
