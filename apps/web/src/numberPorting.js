const base='/api/account/number-porting';
const labels={billing_name:'Name on carrier account',provider:'Current carrier',provider_account:'Carrier account number',street:'Service street address',street2:'Address line 2 (optional)',city:'City',state:'State / province code',zip:'ZIP / postal code',company:'Company (required for business)',pin:'Transfer PIN (if your carrier requires it)',billing_number:'Billing phone number (optional, +1 format)',desired_completion_date:'Requested completion date (optional)'};
export function showNumberPorting({document,get,request,user}){
 const parent=document.querySelector('#signed-in-profile');if(!parent)return;
 let old=document.querySelector('#number-porting');if(old?.dataset.userId===user.id)return;old?.remove();
 const root=document.createElement('details');root.id='number-porting';root.dataset.userId=user.id;
 root.innerHTML=`<summary>Port a number to Olamide</summary>
 <p>Bring a US or Canadian number from another carrier. Keep your current service active until the transfer completes. Carrier approval and timing vary. Porting does not automatically approve outbound SMS registration.</p>
 <form data-port-form><label>Phone number <input name="number" type="tel" placeholder="+12125550123" required maxlength="16"></label>
 <button type="button" data-check>Check portability</button><p role="status" data-portability></p>
 <label>Country <select name="country"><option value="US">United States</option><option value="CA">Canada</option></select></label>
 <label>Account type <select name="usage_type"><option>Residential</option><option>Business</option></select></label>
 <div data-fields></div>
 <label><input type="checkbox" name="authorized" required> I am the account holder or am authorized to transfer this number.</label>
 <button type="submit">Save port request</button></form>
 <p>After saving, upload your latest carrier bill, confirm submission, then review and electronically sign Flowroute’s Letter of Agency. Status updates are checked automatically.</p>
 <button type="button" data-refresh>Refresh port requests</button><p data-status role="status" aria-live="polite"></p><div data-orders></div>`;
 parent.append(root);const $=s=>root.querySelector(s),form=$('[data-port-form]'),status=$('[data-status]');let requestKey=crypto.randomUUID(),busy=false;
 const active=()=>root.isConnected&&document.querySelector('#number-porting')===root;
 for(const [name,label] of Object.entries(labels)){
  const l=document.createElement('label'),input=document.createElement('input');l.textContent=label+' ';input.name=name;
  input.required=['billing_name','provider','provider_account','street','city','state','zip'].includes(name);input.maxLength=name==='pin'?64:150;
  input.type=name==='pin'?'password':name==='desired_completion_date'?'date':'text';if(name==='state'){input.maxLength=2;input.placeholder='TX';}if(name==='pin')input.autocomplete='off';l.append(input);$('[data-fields]').append(l);
 }
 function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){if(active())status.textContent=e.message;}finally{b.disabled=false;}};return b;}
 async function fileContent(file){if(!file||file.size>5*1024*1024)throw Error('Choose a PDF, PNG or JPEG up to 5 MB');const reader=new document.defaultView.FileReader();return await new Promise((resolve,reject)=>{reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Could not read the document'));reader.readAsDataURL(file);});}
 async function refresh(){
  if(busy)return;busy=true;try{const data=await get(base);if(!active())return;const out=$('[data-orders]');out.replaceChildren();
   if(!data.configured)status.textContent='Number porting setup requires administrator attention.';
   for(const r of data.requests){
    const card=document.createElement('section'),heading=document.createElement('h4'),state=document.createElement('p');heading.textContent=r.number;state.textContent=`${r.status.replaceAll('_',' ')}${r.carrierStatus?' · Carrier: '+r.carrierStatus:''}`;card.append(heading,state);
    if(r.lastError){const p=document.createElement('p');p.textContent=r.lastError;card.append(p);}if(r.nextStep){const p=document.createElement('p');p.textContent=r.nextStep;card.append(p);}
    if(['draft','awaiting_documents'].includes(r.status)){
     const label=document.createElement('label'),upload=document.createElement('input');upload.type='file';upload.accept='.pdf,.png,.jpg,.jpeg';label.textContent='Recent carrier bill ';label.append(upload);card.append(label,button('Upload bill',async()=>{await request(`${base}/${r.id}/document`,{content:await fileContent(upload.files[0])});status.textContent='Bill uploaded securely. Confirm submission when ready.';}));
     if(r.status==='draft'){
      const label=document.createElement('label'),confirm=document.createElement('input');confirm.type='checkbox';label.append(confirm,document.createTextNode(' I authorize creation of the carrier port order and acknowledge that carrier porting or cancellation charges may apply. Final transfer requires my signed LOA.'));
      card.append(label,button('Submit to Flowroute',async()=>{if(!confirm.checked)throw Error('Confirm transfer authorization first');await request(`${base}/${r.id}/submit`,{confirmTransfer:true});await refresh();status.textContent='Request queued. Automatic processing will continue; refresh shortly.';}));
     }
    }
    if(r.status==='awaiting_loa')card.append(button('Review and sign LOA',async()=>{
     const loa=await get(`${base}/${r.id}/loa`);if(!active())return;
     const box=document.createElement('div'),copy=document.createElement('pre');copy.style.whiteSpace='pre-wrap';copy.textContent=loa.text;box.append(copy);
     const fields={};for(const [name,label] of [['signatureName','Full name of authorized signer'],['signatureTitle','Signer title / capacity']]){const l=document.createElement('label'),input=document.createElement('input');input.maxLength=150;input.required=true;l.textContent=label+' ';l.append(input);box.append(l);fields[name]=input;}
     const l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';l.append(c,document.createTextNode(' I have read this LOA and authorize Flowroute to transfer the displayed number on my behalf.'));box.append(l,button('Sign and authorize transfer',async()=>{if(!c.checked||!fields.signatureName.value.trim()||!fields.signatureTitle.value.trim())throw Error('Complete the signer details and authorization');await request(`${base}/${r.id}/sign`,{hash:loa.hash,signatureName:fields.signatureName.value,signatureTitle:fields.signatureTitle.value,authorize:true});await refresh();status.textContent='Signed authorization queued for carrier submission.';}));card.append(box);
    }));
    if(!['draft','completed','canceled','abandoned','hard_canceled'].includes(r.status))card.append(button('Check carrier status',async()=>{await request(`${base}/${r.id}/refresh`,{});status.textContent='Carrier status check queued; automatic checks continue every five minutes.';}));
    out.append(card);
   }
   if(!data.requests.length)out.textContent='No port requests yet.';
  }finally{busy=false;}
 }
 $('[data-check]').onclick=async()=>{const b=$('[data-check]');b.disabled=true;try{const data=await request(base+'/check',{number:form.elements.number.value.trim()});if(active())$('[data-portability]').textContent=data.portable?'Carrier confirms portability. Complete your account details to continue.':'Carrier did not confirm portability for this number.';}catch(e){$('[data-portability]').textContent=e.message;}finally{b.disabled=false;}};
 form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;try{const values=Object.fromEntries(new document.defaultView.FormData(form));values.state=values.state.toUpperCase();await request(base,{...values,requestKey,authorized:form.elements.authorized.checked});requestKey=crypto.randomUUID();form.reset();status.textContent='Request saved. Upload the carrier bill below, then confirm submission.';await refresh();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};
 $('[data-refresh]').onclick=()=>refresh().catch(e=>{if(active())status.textContent=e.message;});
 root.addEventListener('toggle',()=>{if(root.open)void refresh().catch(e=>{if(active())status.textContent=e.message;});});
 const timer=setInterval(()=>{if(!active()){clearInterval(timer);return;}if(root.open&&!root.closest('[hidden]'))void refresh().catch(()=>{});},30000);
 return {refresh,stop(){clearInterval(timer);root.remove();}};
}
