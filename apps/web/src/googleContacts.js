export const googleContactsScope='https://www.googleapis.com/auth/contacts.readonly';
const primary=values=>values?.find(v=>v.metadata?.primary)||values?.[0];
export function googlePeopleToContacts(people){
 const unique=new Map();
 for(const person of people||[]){
  const email=String(primary(person.emailAddresses)?.value||'').trim().toLowerCase(),phone=String(primary(person.phoneNumbers)?.value||'').trim();
  const name=String(primary(person.names)?.displayName||email||phone).trim();
  if((!email&&!phone)||(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))continue;
  const contact={name:name.slice(0,160),email,phone:phone.slice(0,64)};if(email.length>254)continue;
  unique.set(email+'\0'+contact.phone,contact);
 }return [...unique.values()];
}
export async function fetchGoogleContacts(token,{fetchImpl=fetch,signal,limit=500}={}){
 let pageToken,people=[],pages=0;const seen=new Set();
 do{
  const url=new URL('https://people.googleapis.com/v1/people/me/connections');
  url.searchParams.set('personFields','names,emailAddresses,phoneNumbers');url.searchParams.set('pageSize','500');url.searchParams.set('sortOrder','FIRST_NAME_ASCENDING');
  if(pageToken)url.searchParams.set('pageToken',pageToken);
  const response=await fetchImpl(url.href,{headers:{Authorization:'Bearer '+token},signal,credentials:'omit',cache:'no-store'});
  if(!response.ok)throw Error(response.status===401?'Google access expired. Import again.':response.status===403?'Google Contacts access was denied or the People API is not enabled.':'Google Contacts could not be loaded. Retry later.');
  const data=await response.json();people.push(...(data.connections||[]));pageToken=data.nextPageToken;
  if(pageToken){if(seen.has(pageToken))throw Error('Google returned a repeated page token');seen.add(pageToken);}
  pages++;
 }while(pageToken&&people.length<limit&&pages<10);
 const rows=googlePeopleToContacts(people);return {contacts:rows.slice(0,limit),limited:!!pageToken||rows.length>limit};
}
let sdkPromise;
function loadGoogleSdk(document){
 if(document.defaultView.google?.accounts?.oauth2)return Promise.resolve(document.defaultView.google.accounts.oauth2);
 if(sdkPromise)return sdkPromise;
 sdkPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.referrerPolicy='no-referrer';
  const timer=setTimeout(()=>{script.remove();sdkPromise=null;reject(Error('Google sign-in could not load. Use CSV import or retry.'));},15000);
  script.onload=()=>{clearTimeout(timer);const sdk=document.defaultView.google?.accounts?.oauth2;if(sdk)resolve(sdk);else{sdkPromise=null;reject(Error('Google authorization is unavailable.'));}};
  script.onerror=()=>{clearTimeout(timer);script.remove();sdkPromise=null;reject(Error('Google sign-in could not load. Use CSV import.'));};document.head.append(script);
 });return sdkPromise;
}
export function setupGoogleContactsImport({document,get,preview,onStatus}){
 const button=document.getElementById('google-contact-import'),note=document.getElementById('google-contact-status');let client,version=0,abort,preparing,requestVersion=0;
 button.disabled=true;
 async function prepare(){
  if(client||preparing)return preparing;
  const current=version;
  preparing=(async()=>{try{
   const config=await get('/api/contacts/google/config');if(current!==version)return;
   if(!config.configured){note.textContent='Direct Google import needs administrator setup. You can import a Google CSV export below.';return;}
   const sdk=await loadGoogleSdk(document);if(current!==version)return;
   client=sdk.initTokenClient({client_id:config.clientId,scope:googleContactsScope,include_granted_scopes:false,
    callback:async result=>{
     const attempt=requestVersion;if(attempt!==version){result.access_token='';return;}
     try{
      if(result.error||!result.access_token||!sdk.hasGrantedAllScopes(result,googleContactsScope))throw Error('Allow read-only Contacts access to import.');
      abort=new document.defaultView.AbortController();note.textContent='Loading Google Contacts…';
      const data=await fetchGoogleContacts(result.access_token,{signal:abort.signal});
      if(attempt!==version)return;
      if(!data.contacts.length)throw Error('No contacts with email or phone were found.');
      const imported=await preview(data.contacts);if(attempt!==version)return;
      if(!imported?.imported)onStatus('Review and select contacts, then press Import selected contacts.');note.textContent=`Loaded ${data.contacts.length} contacts.${data.limited?' Showing the first 500 contacts.':''}`;
     }catch(e){if(attempt===version&&e.name!=='AbortError')note.textContent=e.message;}
     finally{result.access_token='';if(attempt===version)button.disabled=false;}
    },error_callback:()=>{if(requestVersion!==version)return;button.disabled=false;note.textContent='Google authorization was closed or blocked. Please retry.';}});
   button.disabled=false;note.textContent='Connect Google with read-only Contacts access. Contacts are saved automatically when automatic import is enabled.';
  }catch(e){if(current===version)note.textContent=e.message;}finally{preparing=null;}})();return preparing;
 }
 button.onclick=()=>{if(!client)return;requestVersion=version;button.disabled=true;note.textContent='Choose a Google account and allow Contacts access.';client.requestAccessToken({prompt:'select_account'});};
 return {prepare,clear(){version++;abort?.abort();client=null;preparing=null;button.disabled=true;note.textContent='';}};
}
