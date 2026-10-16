export function setupMarketplaceControl({get,request}){
 const panel=document.querySelector('#payment-admin');
 const box=document.createElement('div');box.id='marketplace-management';
 box.innerHTML=`<h3>Marketplace and authorized resellers</h3>
 <p>Each workspace has its own catalog, orders and payment credentials. Super administrators authorize reseller stores here. Use workspace switching to administer another store.</p>
 <button type="button" id="market-refresh">Refresh stores and gateways</button>
 <button type="button" id="market-plans">Add recommended SIP plans as drafts</button>
 <p>Suggested monthly prices: Personal $9.95, Team $29.95, Business $79.95. Usage and numbers are billed separately. Review capacity, margin and delivery terms in Product catalog management before publishing.</p>
 <p id="market-status" role="status"></p><div id="market-stores"></div>
 <h3>Store payment gateways</h3><p>Stripe is managed above. Paystack and Flutterwave require merchant accounts supporting USD. After checkout, customers use Verify payment in Billing. Automatic webhook reconciliation is currently available for Stripe.</p>
 <ul id="market-gateways"></ul>
 <form id="market-gateway-form" hidden>
 <label>Provider <select name="provider"><option value="paystack">Paystack</option><option value="flutterwave">Flutterwave</option></select></label>
 <label>Environment <select name="environment"><option value="test">Test</option><option value="live">Live</option></select></label>
 <label>Secret API key <input type="password" name="secretKey" autocomplete="off" placeholder="Leave blank to preserve saved key"></label>
 <label><input type="checkbox" name="enabled">Enable for this store</label>
 <label><input type="checkbox" name="confirmLive">Confirm live payments</label><button>Save gateway</button></form>`;
 panel.append(box);
 const status=box.querySelector('#market-status');
 let epoch=0;
 function reset(){epoch++;box.querySelector('#market-stores').replaceChildren();box.querySelector('#market-gateways').replaceChildren();box.querySelector('#market-gateway-form').reset();box.querySelector('#market-gateway-form').hidden=true;status.textContent='';}
 async function refresh(){const current=++epoch;try{
  const [stores,gateways]=await Promise.all([get('/api/admin/marketplace/stores'),get('/api/admin/marketplace/gateways')]);
  if(current!==epoch)return;
  box.querySelector('#market-gateway-form').hidden=!gateways.editable;
  const list=box.querySelector('#market-gateways');list.replaceChildren();
  for(const p of gateways.catalog){const li=document.createElement('li'),saved=gateways.gateways.find(g=>g.provider===p.id);li.textContent=`${p.name}: ${p.implemented?(p.id==='stripe'?'configured above':saved?`${saved.environment} · ${saved.enabled?'enabled':'disabled'}`:'not configured'):'adapter not implemented'}`;list.append(li);}
  const container=box.querySelector('#market-stores');container.replaceChildren();
  for(const store of stores.stores){const form=document.createElement('form'),heading=document.createElement('h4');heading.textContent=store.tenant_name;form.append(heading);
   const name=document.createElement('input');name.value=store.name||store.tenant_name;name.maxLength=100;name.required=true;name.disabled=!stores.editable&&!(store.authorized&&store.enabled);
   const label=document.createElement('label');label.textContent='Store name ';label.append(name);form.append(label);
   const checks={};for(const [field,text,column] of [['authorized','Authorized reseller','authorized'],['enabled','Store enabled','enabled'],['gatewayAdmin','Reseller can manage payment gateways','gateway_admin']]){
    const l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.checked=!!store[column];c.disabled=!stores.editable;l.append(c,document.createTextNode(text));checks[field]=c;form.append(l);
   }
   if(stores.editable){const button=document.createElement('button');button.textContent='Save store authorization';form.append(button);form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{await request('/api/admin/marketplace/stores',{tenantId:store.id,name:name.value,...Object.fromEntries(Object.entries(checks).map(([k,c])=>[k,c.checked]))},'PUT');status.textContent='Store authorization saved.';await refresh();}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};}
   if(!stores.editable&&store.authorized&&store.enabled){const button=document.createElement('button');button.textContent='Save store name';form.append(button);form.onsubmit=async e=>{e.preventDefault();try{await request('/api/admin/marketplace/profile',{name:name.value},'PUT');status.textContent='Store name saved.';}catch(e){status.textContent=e.message;}};}
   container.append(form);
  }
 }catch(e){if(current===epoch)status.textContent=e.message;}}
 box.querySelector('#market-refresh').onclick=refresh;
 box.querySelector('#market-plans').onclick=async()=>{try{await request('/api/admin/marketplace/recommended-plans',{});status.textContent='Recommended plans added as drafts. Open Product catalog management to review and publish.';}catch(e){status.textContent=e.message;}};
 box.querySelector('#market-gateway-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b={provider:f.elements.provider.value,environment:f.elements.environment.value,enabled:f.elements.enabled.checked,confirmLive:f.elements.confirmLive.checked};if(f.elements.secretKey.value)b.secretKey=f.elements.secretKey.value.trim();try{await request('/api/admin/marketplace/gateways',b,'PUT');f.elements.secretKey.value='';status.textContent='Gateway saved.';await refresh();}catch(e){status.textContent=e.message;}};
 return {refresh,reset};
}
