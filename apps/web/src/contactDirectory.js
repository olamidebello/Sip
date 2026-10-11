import {addressBookFromFile} from './addressBookImport.js';
export function setupContactDirectory({get,request,contactsChanged}){
  const $=s=>document.querySelector(s),form=$('#contact-presence-settings'),status=$('#contact-directory-status');
  let pending=[],selected=new Set();
  const fail=e=>{status.textContent=e.message;};
  function preview(rows){pending=rows;selected=new Set(rows.map((_,i)=>i));render();}
  function render(){const list=$('#address-book-preview');list.replaceChildren();pending.forEach((c,i)=>{const li=document.createElement('li'),label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(i);check.onchange=()=>{check.checked?selected.add(i):selected.delete(i);$('#address-book-save').disabled=!selected.size;};label.append(check,document.createTextNode(`${c.name||'Contact'} · ${c.email} · ${c.phone}`));li.append(label);list.append(li);});$('#address-book-save').disabled=!selected.size;}
  async function refresh(){
    const [settings,contacts,book]=await Promise.all([get('/api/account/contact-settings'),get('/api/contacts'),get('/api/contacts/address-book')]);
    for(const key of ['searchable','share_presence','accept_forwarded'])form.elements[key].checked=!!settings[key];
    form.elements.presence.value=settings.presence;form.elements.status_text.value=settings.status_text;
    for(const key of ['call_forward','message_forward']){const select=form.elements[key];select.replaceChildren(new Option('Off',''));for(const c of contacts.contacts)select.add(new Option(c.name||c.email,c.id));select.value=settings[key]||'';}
    $('#address-book-list').replaceChildren(...book.contacts.map(c=>{const li=document.createElement('li');li.textContent=`${c.name||'Contact'} · ${c.email} · ${c.phone}`;return li;}));
  }
  form.onsubmit=async e=>{e.preventDefault();try{const data=Object.fromEntries(new FormData(form));for(const k of ['searchable','share_presence','accept_forwarded'])data[k]=form.elements[k].checked;for(const k of ['call_forward','message_forward'])data[k]=data[k]||null;await request('/api/account/contact-settings',data,'PUT');status.textContent='Visibility, status and forwarding saved.';}catch(e){fail(e);}};
  $('#contact-settings-refresh').onclick=()=>refresh().catch(fail);
  $('#user-directory-search').onsubmit=async e=>{e.preventDefault();try{const q=new FormData(e.currentTarget).get('q'),data=await get('/api/contacts/search?q='+encodeURIComponent(q));const list=$('#user-directory-results');list.replaceChildren();for(const u of data.users){const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent='Add contact';button.onclick=async()=>{try{await request('/api/contacts',{email:u.email});await contactsChanged();status.textContent='Contact added.';}catch(e){fail(e);}};li.append(document.createTextNode(`${u.name} · ${u.email} · ${u.presence} ${u.status_text} `),button);list.append(li);}if(!data.users.length)list.textContent='No searchable users found.';}catch(e){fail(e);}};
  $('#address-book-import').onsubmit=async e=>{e.preventDefault();try{const file=e.currentTarget.elements.file.files[0];if(file.size>256000)throw Error('Contact file exceeds 256 KB');preview(addressBookFromFile(await file.text(),file.name));status.textContent='Review contacts before importing.';}catch(e){fail(e);}};
  $('#phone-contact-import').onclick=async()=>{try{if(!navigator.contacts?.select)throw Error('Phone contact selection is unavailable in this browser. Import a vCard or CSV export instead.');const rows=await navigator.contacts.select(['name','email','tel'],{multiple:true});if(rows.length>500)throw Error('Choose up to 500 contacts');preview(rows.map(c=>({name:c.name?.[0]||'',email:(c.email?.[0]||'').toLowerCase(),phone:c.tel?.[0]||''})));}catch(e){fail(e);}};
  $('#address-book-save').onclick=async()=>{const button=$('#address-book-save');button.disabled=true;try{const contacts=pending.filter((_,i)=>selected.has(i));const result=await request('/api/contacts/address-book',{contacts});preview([]);await refresh();status.textContent=`Imported ${result.processed} contacts into your private address book.`;}catch(e){fail(e);button.disabled=!selected.size;}};
  return {refresh};
}
