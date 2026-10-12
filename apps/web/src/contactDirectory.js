import {choosePhoneContacts,saveContactBatches,grantedPhoneContacts} from './phoneContacts.js';
import {setupGoogleContactsImport} from './googleContacts.js';
import {addressBookFromFile} from './addressBookImport.js';
export function setupContactDirectory({get,request,contactsChanged}){
  const $=s=>document.querySelector(s),form=$('#contact-presence-settings'),status=$('#contact-directory-status');
  let pending=[],selected=new Set(),generation=0,importing=false,phoneAutoSynced=false;
  const fail=e=>{status.textContent=e.message;};
  function preview(rows){$('#address-book-select-all').checked=rows.length>0;pending=rows;selected=new Set(rows.map((_,i)=>i));render();}
  function selectionState(){
    const all=$('#address-book-select-all');all.checked=pending.length>0&&selected.size===pending.length;all.indeterminate=selected.size>0&&selected.size<pending.length;all.disabled=!pending.length||importing;
    $('#address-book-select-all-button').disabled=!pending.length||importing;$('#address-book-clear-selection').disabled=!selected.size||importing;
    $('#address-book-selection-count').textContent=`${selected.size} of ${pending.length} contacts selected`;
    $('#address-book-save').disabled=!selected.size||importing;
  }
  function render(){const list=$('#address-book-preview');list.replaceChildren();pending.forEach((c,i)=>{const li=document.createElement('li'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(i);check.disabled=importing;check.onchange=()=>{check.checked?selected.add(i):selected.delete(i);selectionState();};label.append(check,document.createTextNode(`${c.name||'Contact'} · ${c.email} · ${c.phone}`));li.append(label);list.append(li);});selectionState();}
  $('#address-book-select-all-button').onclick=()=>{selected=new Set(pending.map((_,i)=>i));render();};
  $('#address-book-clear-selection').onclick=()=>{selected.clear();render();};
  const googleImport=setupGoogleContactsImport({document,get,preview:receiveContacts,onStatus:message=>{status.textContent=message;}});
  $('#address-book-select-all').onchange=event=>{selected=event.currentTarget.checked?new Set(pending.map((_,i)=>i)):new Set();render();};
  async function receiveContacts(rows){if(importing)throw Error('A contact import is already in progress');preview(rows);if($('#contacts-auto-import').checked){await save();return {imported:true};}status.textContent='Review contacts before importing.';return {imported:false};}
  async function save(){
    if(importing)return;const current=generation,button=$('#address-book-save');importing=true;render();button.disabled=true;const chosen=pending.filter((_,i)=>selected.has(i));
    try{const result=await saveContactBatches(chosen,request,{valid:()=>current===generation,onBatch:batch=>{if(current!==generation)return;const done=new Set(batch);pending=pending.filter(c=>!done.has(c));selected=new Set(pending.map((_,i)=>i));render();button.disabled=true;}});
      if(current!==generation)return;preview([]);await refresh();await contactsChanged();status.textContent=`Imported ${result.processed} contacts into your private address book.`;
    }catch(e){if(current===generation){status.textContent=e.message+' Completed batches are saved; retry the remaining preview.';throw e;}}
    finally{importing=false;if(current===generation)render();}
  }
  async function refresh(){
    const current=generation;
    void googleImport.prepare();
    const [settings,contacts,book]=await Promise.all([get('/api/account/contact-settings'),get('/api/contacts'),get('/api/contacts/address-book')]);
    if(current!==generation)return;
    for(const key of ['searchable','share_presence','accept_forwarded'])form.elements[key].checked=!!settings[key];
    form.elements.presence.value=settings.presence;form.elements.status_text.value=settings.status_text;
    for(const key of ['call_forward','message_forward']){const select=form.elements[key];select.replaceChildren(new Option('Off',''));for(const c of contacts.contacts)select.add(new Option(c.name||c.email,c.id));select.value=settings[key]||'';}
    $('#address-book-list').replaceChildren(...book.contacts.map(c=>{const li=document.createElement('li');li.textContent=`${c.name||'Contact'} · ${c.email} · ${c.phone}`;return li;}));
    if(!importing&&!phoneAutoSynced&&$('#contacts-auto-import').checked){phoneAutoSynced=true;const rows=await grantedPhoneContacts(window);if(current===generation&&rows?.length)await receiveContacts(rows);}
  }
  form.onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(form));for(const k of ['searchable','share_presence','accept_forwarded'])data[k]=form.elements[k].checked;for(const k of ['call_forward','message_forward'])data[k]=data[k]||null;await request('/api/account/contact-settings',data,'PUT');status.textContent='Visibility, status and forwarding saved.';}catch(e){fail(e);}};
  $('#contact-settings-refresh').onclick=()=>refresh().catch(fail);
  $('#user-directory-search').onsubmit=async e=>{e.preventDefault();try{const q=new FormData(e.currentTarget).get('q'),data=await get('/api/contacts/search?q='+encodeURIComponent(q));const list=$('#user-directory-results');list.replaceChildren();for(const u of data.users){const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent='Add contact';button.onclick=async()=>{try{await request('/api/contacts',{email:u.email});await contactsChanged();status.textContent='Contact added.';}catch(e){fail(e);}};li.append(document.createTextNode(`${u.name} · ${u.email} · ${u.presence} ${u.status_text} `),button);list.append(li);}if(!data.users.length)list.textContent='No searchable users found.';}catch(e){fail(e);}};
  $('#address-book-import').onsubmit=async e=>{e.preventDefault();try{const file=e.currentTarget.elements.file.files[0];if(file.size>256000)throw Error('Contact file exceeds 256 KB');await receiveContacts(addressBookFromFile(await file.text(),file.name));}catch(e){fail(e);}};
  $('#address-book-import').elements.file.onchange=()=>{if($('#contacts-auto-import').checked)$('#address-book-import').requestSubmit();};
  $('#phone-contact-import').onclick=async()=>{const current=generation,button=$('#phone-contact-import');button.disabled=true;try{const rows=await choosePhoneContacts(window);if(current===generation&&rows.length)await receiveContacts(rows);}catch(e){if(current===generation&&e.name!=='AbortError')fail(e);}finally{button.disabled=false;}};
  $('#address-book-save').onclick=()=>save().catch(()=>{});
  return {refresh,reconfigureGoogle(){googleImport.clear();return googleImport.prepare();},clear(){generation++;phoneAutoSynced=false;googleImport.clear();preview([]);$('#address-book-list').replaceChildren();$('#user-directory-results').replaceChildren();status.textContent='';}};
}
