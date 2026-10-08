const $=selector=>document.querySelector(selector);
async function api(path,method='GET',body){
  const response=await fetch(path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},
    body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Operator request failed');return data;
}
export function setupOperatorControl(){
  const status=$('#operator-status'),tariffSelect=$('#operator-tariff'),carrierSelect=$('#operator-carrier');
  async function refresh(){
    try{
      const data=await api('/api/admin/operator');
      const prior=tariffSelect.value;tariffSelect.replaceChildren();carrierSelect.replaceChildren();
      for(const tariff of data.tariffs){const option=document.createElement('option');
        option.value=tariff.id;option.textContent=tariff.name+' ('+tariff.mode+')';tariffSelect.append(option);}
      if(data.tariffs.some(t=>t.id===prior))tariffSelect.value=prior;
      for(const carrier of data.carriers){const option=document.createElement('option');
        option.value=carrier.provider;option.textContent=carrier.provider+' — '+carrier.status;carrierSelect.append(option);}
      const cards=$('#operator-tariffs');cards.replaceChildren();
      for(const tariff of data.tariffs){
        const item=document.createElement('article'),button=document.createElement('button');
        item.append(document.createTextNode(tariff.name+' · '+tariff.mode+' · '+(tariff.enabled?'enabled':'disabled')+' · '+data.rates.filter(r=>r.tariff_id===tariff.id).length+' rates '));
        button.type='button';button.textContent=tariff.enabled?'Disable':'Enable';
        button.onclick=async()=>{try{await api('/api/admin/operator/tariffs/'+tariff.id,'PUT',{enabled:!tariff.enabled});await refresh();}catch(e){status.textContent=e.message;}};
        item.append(button);cards.append(item);
      }
      const rates=$('#operator-rates');rates.replaceChildren();
      for(const rate of data.rates){
        const li=document.createElement('li'),remove=document.createElement('button');remove.type='button';remove.textContent='Remove';
        remove.onclick=async()=>{try{await api('/api/admin/operator/rates/'+rate.id,'DELETE');await refresh();}catch(e){status.textContent=e.message;}};
        li.append(document.createTextNode(rate.prefix+' → '+rate.provider+' · '+rate.cost_cents+'¢ cost / '+rate.price_cents+'¢ price · priority '+rate.priority+' · effective '+rate.effective_at+' '),remove);rates.append(li);
      }
      const blocks=$('#operator-blocks');blocks.replaceChildren();
      for(const block of data.blocks){
        const li=document.createElement('li'),remove=document.createElement('button');remove.type='button';remove.textContent='Remove';
        remove.onclick=async()=>{try{await api('/api/admin/operator/blocks/'+block.id,'DELETE');await refresh();}catch(e){status.textContent=e.message;}};
        li.append(document.createTextNode(block.prefix+' · '+block.reason+' '),remove);blocks.append(li);
      }
      status.textContent=data.tariffs.length+' tariff plans, '+data.rates.length+' rates, '+data.blocks.length+' blocked prefixes. Preview rules are stored; live enforcement is not configured.';
    }catch(e){status.textContent=e.message;}
  }
  function bind(selector,path,make){
    $(selector).onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');
      button.disabled=true;try{await api(path,'POST',make(form));form.reset();await refresh();status.textContent='Saved.';}
      catch(e){status.textContent=e.message;}finally{button.disabled=false;}};
  }
  bind('#operator-create','/api/admin/operator/tariffs',form=>({name:form.elements.name.value,mode:form.elements.mode.value}));
  bind('#operator-rate-create','/api/admin/operator/rates',form=>({
    tariffId:tariffSelect.value,provider:carrierSelect.value,prefix:form.elements.prefix.value,
    costCents:Number(form.elements.cost.value),priceCents:Number(form.elements.price.value),
    priority:Number(form.elements.priority.value),effectiveAt:form.elements.effective.value+':00Z',
    expiresAt:form.elements.expires.value?form.elements.expires.value+':00Z':null}));
  bind('#operator-block-create','/api/admin/operator/blocks',form=>({prefix:form.elements.prefix.value,reason:form.elements.reason.value}));
  $('#operator-quote-form').onsubmit=async event=>{
    event.preventDefault();try{
      const quote=await api('/api/admin/operator/quote','POST',{tariffId:tariffSelect.value,number:event.currentTarget.elements.number.value});
      $('#operator-quote').textContent=quote.blocked?'Blocked: '+quote.reason:
        quote.selected?quote.selected.provider+' · '+quote.selected.prefix+' · '+quote.selected.cost_cents+'¢ cost / '+quote.selected.price_cents+'¢ price · '+quote.candidates.length+' candidate(s). Preview only.':quote.reason;
    }catch(e){$('#operator-quote').textContent=e.message;}
  };
  return {refresh};
}
