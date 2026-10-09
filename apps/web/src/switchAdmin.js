const $=selector=>document.querySelector(selector);
async function api(path,method='GET',body){
  const response=await fetch(path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},
    body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Switch request failed');return data;
}
export function setupSwitchAdmin(){
  const root=$('#switch-admin'),status=$('#switch-status'),form=$('#switch-config');
  let canEdit=false;
  async function readiness(){
    const summary=root.querySelector('#kamailio-readiness-summary');
    const blockers=root.querySelector('#kamailio-readiness-blockers');
    const button=root.querySelector('#kamailio-readiness-refresh');
    button.disabled=true;
    summary.textContent='Checking tenant data…';
    blockers.replaceChildren();
    try{
      const state=await api('/api/admin/switch/kamailio/readiness');
      summary.textContent=state.activeAccounts+' active SIP accounts · '+
        state.syncedCredentials+' digest credentials · '+
        state.enabledCarriers+' enabled carrier mappings. Production readiness is unverified.';
      for(const reason of state.blockers){
        const item=document.createElement('li');
        item.textContent=reason;
        blockers.append(item);
      }
    }catch(error){summary.textContent=error.message;}
    finally{button.disabled=false;}
  }
  async function refresh(edit=canEdit){
    canEdit=edit;
    try{
      const [switchState,operator,accounts]=await Promise.all([
        api('/api/admin/switch'),api('/api/admin/operator'),api('/api/admin/switch/accounts')]);
      const cfg=switchState.config;
      form.elements.domain.value=cfg?.domain||'';
      form.elements.enabled.checked=!!cfg?.enabled;
      const tariff=form.elements.tariffId,selected=cfg?.tariff_id;
      tariff.replaceChildren();
      const blank=document.createElement('option');blank.value='';blank.textContent='No outbound tariff';tariff.append(blank);
      for(const row of operator.tariffs){const option=document.createElement('option');option.value=row.id;option.textContent=row.name;tariff.append(option);}
      tariff.value=selected||'';
      const provider=root.querySelector('#switch-provider'),old=provider.value;provider.replaceChildren();
      for(const carrier of operator.carriers){const option=document.createElement('option');option.value=carrier.provider;option.textContent=carrier.provider+' — '+carrier.status;provider.append(option);}
      if([...provider.options].some(o=>o.value===old))provider.value=old;
      const gateways=root.querySelector('#switch-gateways');gateways.replaceChildren();
      for(const row of switchState.gateways){const li=document.createElement('li');
        li.textContent=row.provider+' → '+row.gateway_name+' ('+(row.enabled?'enabled':'disabled')+')';gateways.append(li);}
      const list=root.querySelector('#switch-accounts');list.replaceChildren();
      for(const account of accounts.accounts){
        const li=document.createElement('li'),button=document.createElement('button');
        li.append(document.createTextNode(account.username+' · '+account.domain+' · '+account.status+' '));
        button.type='button';button.textContent='Activate';button.disabled=!canEdit||account.status==='active'||!cfg?.enabled;
        button.onclick=async()=>{button.disabled=true;try{await api('/api/admin/switch/activate','POST',{userId:account.user_id});await refresh();}
          catch(e){status.textContent=e.message;button.disabled=false;}};li.append(button);list.append(li);
      }
      status.textContent=(cfg?.enabled?'Tenant SIP lookups enabled':'Tenant SIP lookups disabled')+
        ' · '+(switchState.configured?'Kamailio credentials configured':'Kamailio credentials missing')+
        ' · '+Number(switchState.accounts.active)+' active of '+Number(switchState.accounts.total)+' SIP accounts.';
      await readiness();
    }catch(e){status.textContent=e.message;}
  }
  form.onsubmit=async event=>{event.preventDefault();try{
    await api('/api/admin/switch','PUT',{domain:form.elements.domain.value,tariffId:form.elements.tariffId.value||null,
      enabled:form.elements.enabled.checked});await refresh();
  }catch(e){status.textContent=e.message;}};
  root.querySelector('#switch-gateway-form').onsubmit=async event=>{event.preventDefault();
    const f=event.currentTarget;try{await api('/api/admin/switch/gateways','PUT',{
      provider:f.elements.provider.value,gatewayName:f.elements.gatewayName.value,enabled:f.elements.enabled.checked});
      await refresh();}catch(e){status.textContent=e.message;}};
  root.querySelector('#switch-refresh').onclick=refresh;
  root.querySelector('#kamailio-readiness-refresh').onclick=readiness;
  return {refresh};
}
