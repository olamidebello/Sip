export function callingContacts(workspace,book){
 const byEmail=new Map(workspace.map(c=>[String(c.email||'').toLowerCase(),c])),rows=[],seen=new Set();
 for(const c of [...workspace,...book]){
  const linked=byEmail.get(String(c.email||'').toLowerCase()),target=c.sip_address||linked?.sip_address||c.phone||'';
  const key=target||c.email||c.id;if(seen.has(key))continue;seen.add(key);
  rows.push({name:c.name||linked?.name||c.email||target,email:c.email||'',target,internal:!!(c.sip_address||linked?.sip_address)});
 }return rows;
}
export function setupDialerContacts({document,get,input,inCall,onStatus}){
 const search=document.getElementById('dialer-contact-search'),list=document.getElementById('dialer-contact-results'),note=document.getElementById('dialer-contact-status');let rows=[],generation=0;
 function render(){list.replaceChildren();const q=search.value.trim().toLowerCase();const matches=rows.filter(c=>(c.name+' '+c.email+' '+c.target).toLowerCase().includes(q)).slice(0,30);
  for(const c of matches){const li=document.createElement('li'),button=document.createElement('button'),name=document.createElement('strong'),detail=document.createElement('small');button.type='button';button.className='dialer-contact-result';name.textContent=c.name;detail.textContent=c.target?`${c.internal?'SIP':'Phone'} · ${c.target}`:'No phone or registered SIP address';button.append(name,detail);button.disabled=!c.target;button.onclick=()=>{if(inCall()){onStatus('End the current call before selecting another contact.');return;}input.value=c.target;input.dispatchEvent(new document.defaultView.Event('input',{bubbles:true}));note.textContent=`Selected ${c.name}. Press Call to dial.${c.internal?'':' External calls require an active plan.'}`;input.focus();};li.append(button);list.append(li);}
  if(!matches.length)note.textContent=q?'No matching contacts.':'No saved contacts. Import contacts from Chats → New chat.';
 }
 search.oninput=()=>{note.textContent='';render();};
 async function refresh(){const current=++generation;try{const [workspace,book]=await Promise.all([get('/api/contacts'),get('/api/contacts/address-book')]);if(current!==generation)return;rows=callingContacts(workspace.contacts,book.contacts);render();note.textContent=`${rows.length} saved contacts. Search by name, email, phone or SIP address.`;}catch(e){if(current===generation)note.textContent=e.message;}}
 document.getElementById('dialer-contact-refresh').onclick=refresh;
 return {refresh,clear(){generation++;rows=[];search.value='';list.replaceChildren();note.textContent='';}};
}
