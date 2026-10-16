import {parseProductImport,productHeaders} from './productImport.js';
export function setupProductStore({get,request,refreshBilling}){
 const $=s=>document.querySelector(s),money=n=>`USD ${(n/100).toFixed(2)}`;
 let generation=0;
 let products=[],pending=new Map(),adminProducts=[],selection=new Set(),importRows=[],importSelection=new Set();
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){if(!document?.querySelector)return;$('#store-status').textContent=e.message;}finally{b.disabled=false;}};return b;};
 function render(){
  const q=$('#store-search').value.toLowerCase(),category=$('#store-category').value;
  const list=$('#store-products');list.replaceChildren();
  for(const p of products.filter(p=>(!category||p.category===category)&&`${p.name} ${p.description}`.toLowerCase().includes(q))){
   const card=node('article');card.append(node('h3',p.name),node('p',`${p.category} · ${money(p.selling_cents)} / ${p.billing.replace('_',' ')} · setup ${money(p.setup_cents)} per unit`),node('p',p.description));
   const details=node('details');details.append(node('summary','Service terms'),node('p',p.terms));card.append(details);
   const qty=node('input');qty.type='number';qty.min=1;qty.max=100;qty.value=1;const label=node('label','Quantity ');label.append(qty);card.append(label);
   const check=node('input');check.type='checkbox';const accepted=node('label',' I accept the service terms and displayed price.');accepted.prepend(check);card.append(accepted);
   card.append(button(p.billing==='one_time'?'Purchase':'Subscribe',async()=>{
    if(!check.checked)throw new Error('Accept the service terms first');
    const quantity=Number(qty.value),key=`${p.sku}:${p.revision}:${quantity}`;
    if(!pending.has(key))pending.set(key,crypto.randomUUID());
    const result=await request('/api/store/orders',{sku:p.sku,revision:p.revision,quantity,acceptTerms:true,requestKey:pending.get(key)});
    pending.delete(key);$('#store-status').textContent='Order recorded. Pay its invoice under Billing; fulfillment follows separately.';await refreshOrders();await refreshBilling();
   }));list.append(card);
  }
  if(!list.children.length)list.append(node('p','No matching published products.'));
 }
 async function refresh(){const token=generation;try{
  const info=await get('/api/store/info');if(token!==generation)return;if($('#marketplace-store-name'))$('#marketplace-store-name').textContent=info.name;
  const d=await get('/api/store/products');if(token!==generation)return;products=d.products;const select=$('#store-category'),prior=select.value;select.replaceChildren(new Option('All categories',''),...[...new Set(products.map(p=>p.category))].map(c=>new Option(c,c)));select.value=prior;render();await refreshOrders();
 }catch(e){if(token!==generation||!document?.querySelector)return;$('#store-status').textContent=e.message;}}
 async function refreshOrders(){const token=generation;const d=await get('/api/store/orders');if(token!==generation)return;const list=$('#store-orders');list.replaceChildren();for(const o of d.orders){
  const li=node('li',`${o.name} x ${o.quantity} · ${money(o.amount_cents)} · payment ${o.payment_status} · service ${o.status}${o.next_bill_at?` · next invoice ${new Date(o.next_bill_at).toLocaleDateString()}`:''}`);
  if(!['cancelled','fulfilled'].includes(o.status))li.append(button('Cancel order / stop renewal',async()=>{if(!confirm('Stop future invoices? Paid charges need separate refund handling.'))return;const r=await request(`/api/store/orders/${o.id}/cancel`,{});$('#store-status').textContent=r.message;await refreshOrders();await refreshBilling();}));list.append(li);
 }}
 async function refreshAdmin(){const token=generation;try{
  const [catalog,orders]=await Promise.all([get('/api/admin/store/products'),get('/api/admin/store/orders')]);if(token!==generation)return;const list=$('#store-admin-products');list.replaceChildren();
  adminProducts=catalog.products;selection=new Set([...selection].filter(sku=>adminProducts.some(p=>p.sku===sku)));
  for(const p of catalog.products){const detail=node('details');detail.append(node('summary',`${p.name} · ${money(p.selling_cents)} · ${p.status}`));const choose=node('input');choose.type='checkbox';choose.dataset.sku=p.sku;choose.checked=selection.has(p.sku);const chooseLabel=node('label',' Select '+p.name);chooseLabel.prepend(choose);detail.querySelector('summary').prepend(chooseLabel);chooseLabel.onclick=e=>e.stopPropagation();choose.onchange=()=>{choose.checked?selection.add(p.sku):selection.delete(p.sku);updateSelection();};const form=node('form');
   for(const [key,title,type,value] of [['name','Name','text',p.name],['description','Description','textarea',p.description],['terms','Service, destination, fair-use, delivery and refund terms','textarea',p.terms],['sellingCents','Selling price (USD cents)','number',p.selling_cents],['resellerCents','Reseller cost (USD cents; private)','number',p.reseller_cents],['setupCents','Setup price (USD cents)','number',p.setup_cents]]){
    const field=node(type==='textarea'?'textarea':'input');field.name=key;if(type!=='textarea')field.type=type;if(type==='number'){field.min=0;field.max=100000000;}field.value=value;field.required=key!=='terms';const label=node('label',title+' ');label.append(field);form.append(label);
   }
   for(const [key,values,current] of [['billing',['one_time','monthly','quarterly','annual'],p.billing],['status',['draft','published','archived'],p.status]]){const select=node('select');select.name=key;select.append(...values.map(v=>new Option(v,v)));select.value=current;const label=node('label',key+' ');label.append(select);form.append(label);}
   const confirm=node('input');confirm.type='checkbox';confirm.name='confirmAvailability';const label=node('label',' Confirm current provider availability, costs and fulfillment readiness before publishing.');label.prepend(confirm);form.append(label,node('button','Save product'));
   form.onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(form));for(const k of ['sellingCents','resellerCents','setupCents'])b[k]=Number(b[k]);b.confirmAvailability=confirm.checked;b.sku=p.sku;b.revision=p.revision;
    try{await request('/api/admin/store/products',b,'PUT');$('#store-admin-status').textContent='Product saved';await refreshAdmin();await refresh();}catch(e){if(!document?.querySelector)return;$('#store-admin-status').textContent=e.message;}
   };detail.append(form);list.append(detail);
  }
  updateSelection();
  const history=$('#store-admin-orders');history.replaceChildren();for(const o of orders.orders){const li=node('li',`${o.name} · user ${o.user_id} · payment ${o.payment_status} · service ${o.status}`);
   if(o.payment_status==='paid'&&o.status==='awaiting_fulfillment')li.append(button('Record verified fulfillment',async()=>{const note=prompt('Enter delivery / provisioning receipt (at least 10 characters)');if(!note)return;await request(`/api/admin/store/orders/${o.id}/fulfill`,{note});await refreshAdmin();}));history.append(li);
  }
 }catch(e){if(token!==generation||!document?.querySelector)return;$('#store-admin-status').textContent=e.message;}}
 function filteredProducts(){const q=$('#store-admin-search').value.toLowerCase();return adminProducts.filter(p=>`${p.sku} ${p.name} ${p.category}`.toLowerCase().includes(q));}
 function updateSelection(){
  const visible=filteredProducts(),all=$('#store-select-all'),count=visible.filter(p=>selection.has(p.sku)).length;
  all.checked=visible.length>0&&count===visible.length;all.indeterminate=count>0&&count<visible.length;
  $('#store-selection-count').textContent=`${selection.size} selected (${visible.length} matching)`;
  $('#store-bulk-apply').disabled=!selection.size;
  for(const check of $('#store-admin-products').querySelectorAll('input[data-sku]')){check.checked=selection.has(check.dataset.sku);check.closest('details').hidden=!visible.some(p=>p.sku===check.dataset.sku);}
 }
 $('#store-admin-search').oninput=updateSelection;
 $('#store-select-all').onchange=e=>{for(const p of filteredProducts())e.target.checked?selection.add(p.sku):selection.delete(p.sku);updateSelection();};
 $('#store-clear-selection').onclick=()=>{selection.clear();updateSelection();};
 $('#store-bulk-apply').onclick=async()=>{
  const b=$('#store-bulk-apply');b.disabled=true;
  try{
   const selected=adminProducts.filter(p=>selection.has(p.sku)).map(p=>({sku:p.sku,revision:p.revision}));
   if(!selected.length)throw Error('Select products first');
   const status=$('#store-bulk-status').value;
   if(!confirm(`Set ${selected.length} selected products to ${status}?`))return;
   const r=await request('/api/admin/store/products/bulk',{products:selected,status,confirmAvailability:$('#store-bulk-ready').checked});
   selection.clear();await refreshAdmin();await refresh();$('#store-admin-status').textContent=`Updated ${r.updated} products to ${r.status}.`;
  }catch(e){if(!document?.querySelector)return;$('#store-admin-status').textContent=e.message;}finally{updateSelection();}
 };
 function renderImport(){
  const count=importSelection.size,total=importRows.length,all=$('#store-import-all');
  all.checked=total>0&&count===total;all.indeterminate=count>0&&count<total;
  $('#store-import-count').textContent=`${count} of ${total} selected`;$('#store-import-selected').disabled=!count;
  $('#store-import-rows').replaceChildren(...importRows.map((p,i)=>{
   const li=node('li'),label=node('label',` ${p.sku} · ${p.name} · ${money(p.sellingCents)} · ${p.billing}`),check=node('input');check.type='checkbox';check.checked=importSelection.has(i);
   check.onchange=()=>{check.checked?importSelection.add(i):importSelection.delete(i);renderImport();};label.prepend(check);li.append(label);return li;
  }));
 }
 $('#store-import-file').onchange=()=>{importRows=[];importSelection.clear();renderImport();};
 $('#store-import-all').onchange=e=>{importSelection=new Set(e.target.checked?importRows.map((_,i)=>i):[]);renderImport();};
 $('#store-import-preview').onclick=async()=>{
  importRows=[];importSelection.clear();renderImport();
  try{const file=$('#store-import-file').files?.[0];if(!file)throw Error('Choose a CSV or JSON product file');if(file.size>2*1024*1024)throw Error('File exceeds 2 MB');
   importRows=parseProductImport(await file.text(),file.name.toLowerCase().endsWith('.json'));importSelection=new Set(importRows.map((_,i)=>i));renderImport();
   $('#store-admin-status').textContent='Preview ready. Select the products to import.';
  }catch(e){if(!document?.querySelector)return;$('#store-admin-status').textContent=e.message;}
 };
 $('#store-import-selected').onclick=async()=>{
  const b=$('#store-import-selected');b.disabled=true;
  try{const selected=importRows.filter((_,i)=>importSelection.has(i));if(!selected.length)throw Error('Select import rows first');
   const r=await request('/api/admin/store/import',{products:selected});importRows=[];importSelection.clear();renderImport();await refreshAdmin();
   $('#store-admin-status').textContent=`Imported ${r.imported} drafts; skipped ${r.skipped} existing SKUs.`;
  }catch(e){if(!document?.querySelector)return;$('#store-admin-status').textContent=e.message;}finally{b.disabled=!importSelection.size;}
 };
 $('#store-import-template').onclick=()=>{
  const source=productHeaders.join(',')+'\r\nCUSTOM-001,Example service,Services,Service description,Review delivery and refund terms before publishing,monthly,1995,1500,0\r\n';
  const url=URL.createObjectURL(new Blob([source],{type:'text/csv'})),link=node('a');link.href=url;link.download='product-import-template.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 $('#store-search').oninput=render;$('#store-category').onchange=render;$('#store-refresh').onclick=refresh;$('#store-admin-refresh').onclick=refreshAdmin;
 $('#store-import-reference').onclick=async()=>{try{const r=await request('/api/admin/store/import-reference',{});$('#store-admin-status').textContent=`${r.referenceCount} reference products available as drafts. Existing edits preserved.`;await refreshAdmin();}catch(e){if(!document?.querySelector)return;$('#store-admin-status').textContent=e.message;}};
 $('#store-product-create').onsubmit=async event=>{event.preventDefault();const f=event.currentTarget,b={status:'draft'};for(const key of ['sku','name','category','description','terms','billing'])b[key]=f.elements[key].value;for(const key of ['sellingCents','resellerCents','setupCents'])b[key]=Number(f.elements[key].value);const submit=f.querySelector('button');submit.disabled=true;try{await request('/api/admin/store/products',b);f.reset();await refreshAdmin();$('#store-admin-status').textContent='Draft created. Review availability and terms before publishing.';}catch(e){if(!document?.querySelector)return;$('#store-admin-status').textContent=e.message;}finally{submit.disabled=false;}};
 return {refresh,refreshAdmin,stop(){generation++;products=[];adminProducts=[];pending.clear();selection.clear();importRows=[];importSelection.clear();for(const id of ['store-products','store-orders','store-admin-products','store-admin-orders','store-import-rows'])$('#'+id)?.replaceChildren();}};
}
