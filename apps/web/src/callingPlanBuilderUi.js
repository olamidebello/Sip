export function setupCallingPlanBuilder({document,get,request,getUserId,show,refreshBilling=async()=>{},navigate=url=>globalThis.location.assign(url),setTimer=setTimeout,clearTimer=clearTimeout}){
 const billing=document.getElementById('billing'),account=document.getElementById('account'),builderHost=account||billing;if(!builderHost)return {dispose(){}};
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
 const panel=node('details');panel.id='calling-plan-builder';panel.append(node('summary','Build a plan'));
 panel.append(node('p','Choose the countries you call and your average daily minutes for each. Your 30-day estimate uses current selling rates. Actual call charges depend on destination, duration and billing intervals. This prepaid budget shares your USD wallet; it does not add a subscription fee or unlimited minutes.'));
 const rows=node('div'),summary=node('div'),status=node('p'),history=node('div');status.setAttribute('role','status');summary.setAttribute('aria-live','polite');
 const calculate=button('Calculate monthly plan',()=>void quote()),buy=button('Create plan & fund',()=>void purchase());buy.disabled=true;
 const terms=node('input');terms.type='checkbox';const acceptance=node('label');acceptance.append(terms,' I accept the displayed estimate and funding amount. Calls use live rates; unused funds stay in my wallet. No automatic monthly charge.');
 const add=button('Add calling country',()=>addRow()),reload=button('Refresh my plans',()=>void loadPlans());
 panel.append(rows,add,calculate,summary,acceptance,buy,status,reload,history);builderHost.prepend(panel);
 const shortcuts=[];for(const host of [account,billing,document.getElementById('product-store'),document.getElementById('calling-workspace')].filter(Boolean)){
  const b=button('Build a plan',()=>{if(!getUserId())return;show(builderHost.id);panel.open=true;panel.scrollIntoView?.({block:'start'});void initialize();});b.dataset.buildCallingPlan='';host.prepend(b);shortcuts.push(b);
 }
 let owner=getUserId(),generation=0,revision=0,countryList=[],catalogPromise=null,current=null,pending=null,timer,disposed=false;
 const money=n=>'$'+(Number(n)/100).toFixed(2),valid=(g,id)=>!disposed&&generation===g&&getUserId()===id&&!!id;
 const names=typeof Intl.DisplayNames==='function'?new Intl.DisplayNames(['en'],{type:'region'}):null;
 function changed(){revision++;current=null;buy.disabled=true;terms.checked=false;summary.replaceChildren();clearTimer(timer);if(getUserId())timer=setTimer(()=>void quote(),600);}
 function addRow(value={}){
  if(rows.children.length>=10){status.textContent='Maximum 10 destination rows.';return;}
  const row=node('fieldset'),country=node('select'),minutes=node('input'),sample=node('input'),hint=node('p');country.dataset.country='';country.setAttribute('aria-label','Calling country');
  for(const c of countryList){const option=node('option',(names?.of(c.country)||c.country)+' (+'+c.callingCode+')');option.value=c.country;country.append(option);}country.value=value.country||'NG';
  minutes.type='number';minutes.min='1';minutes.max='1440';minutes.step='1';minutes.value=value.dailyMinutes||'10';minutes.dataset.dailyMinutes='';
  sample.type='tel';sample.placeholder='+2348012345678';sample.value=value.sampleNumber||'';sample.dataset.sampleNumber='';
  for(const [label,input]of [['Country to call ',country],['Average daily calling minutes ',minutes],['Example international number (optional unless code is shared) ',sample]]){const l=node('label',label);l.append(input);row.append(l);}
  function updateHint(){const metadata=countryList.find(c=>c.country===country.value);hint.textContent=metadata?.exampleRequired?'Enter an example number because this calling code is shared by several countries.':'Without an example number, the estimate uses the highest listed rate for this calling code. Add an example to estimate a particular network.';}
  country.onchange=()=>{sample.value='';updateHint();changed();};minutes.oninput=changed;sample.oninput=changed;updateHint();row.append(hint,button('Remove country',()=>{row.remove();changed();}));rows.append(row);changed();
 }
 async function initialize(){
  const g=generation,id=getUserId();if(!id)return;
  try{
   catalogPromise??=get('/api/billing/calling-plans/countries').catch(e=>{catalogPromise=null;throw e;});
   const data=await catalogPromise;if(!valid(g,id))return;
   countryList=data.countries.sort((a,b)=>(names?.of(a.country)||a.country).localeCompare(names?.of(b.country)||b.country));
   if(!rows.children.length)addRow();await loadPlans();
  }catch(e){if(valid(g,id))status.textContent=e.message;}
 }
 async function quote(){
  clearTimer(timer);const g=generation,id=getUserId(),r=++revision;current=null;buy.disabled=true;terms.checked=false;if(!id||!rows.children.length)return;
  const destinations=[...rows.children].map(row=>({country:row.querySelector('[data-country]').value,dailyMinutes:Number(row.querySelector('[data-daily-minutes]').value),sampleNumber:row.querySelector('[data-sample-number]').value}));
  status.textContent='Calculating from current selling rates…';
  try{const result=await request('/api/billing/calling-plans/quote',{destinations});if(!valid(g,id)||r!==revision)return;
   current=result;summary.replaceChildren();const table=node('table'),head=node('tr');for(const t of ['Country / rate basis','Daily minutes','30-day minutes','Selling rate / min','Monthly estimate'])head.append(node('th',t));table.append(head);
   for(const line of result.destinations){const tr=node('tr');for(const text of [(names?.of(line.country)||line.country)+' · '+line.rateBasis,line.dailyMinutes,line.monthlyMinutes,'$'+line.sellingRate,money(line.monthlyCents)])tr.append(node('td',String(text)));table.append(tr);}
   summary.append(table,node('p','Total: '+result.dailyMinutes+' min/day · '+result.monthlyMinutes+' min / '+result.days+' days · '+money(result.totalCents)+' USD'),node('p','Current wallet: '+money(result.existingBalanceCents)+' · Additional funding: '+money(result.fundingCents)));
   buy.textContent=result.fundingCents?'Create plan & fund '+money(result.fundingCents):'Use current calling balance';buy.disabled=false;status.textContent='Estimate valid for 10 minutes. Review the total and accept the terms.';
  }catch(e){if(valid(g,id)&&r===revision){summary.replaceChildren();status.textContent=e.message;}}
 }
 async function checkout(invoiceId,provider){
  const g=generation,id=getUserId();try{const result=await request(provider==='stripe'?'/api/payments/checkout':'/api/marketplace/checkout',{invoiceId,...(provider==='stripe'?{}:{provider})});if(!valid(g,id))return;
   const url=new URL(result.url),allowed={stripe:'checkout.stripe.com',paystack:'checkout.paystack.com',flutterwave:'checkout.flutterwave.com'};
   if(url.protocol!=='https:'||url.hostname!==allowed[provider]||url.username||url.password)throw Error('Invalid checkout destination');navigate(url.href);
  }catch(e){if(valid(g,id))status.textContent=e.message;}
 }
 async function paymentButtons(parent,invoiceId,g,id){
  const [capabilities,gateways]=await Promise.all([get('/api/wallet/capabilities').catch(()=>({})),get('/api/marketplace/gateways').catch(()=>({providers:[]}))]);if(!valid(g,id))return;
  const providers=[...(capabilities.invoiceCheckoutAvailable?['stripe']:[]),...(gateways.providers||[]).filter(p=>['paystack','flutterwave'].includes(p))];
  for(const provider of providers)parent.append(button('Fund with '+provider,()=>void checkout(invoiceId,provider)));
  if(!providers.length)parent.append(node('p','Online funding is not configured. Contact the administrator; your plan remains awaiting payment.'));
 }
 async function purchase(){
  if(!current||!terms.checked){status.textContent='Calculate your plan and accept the displayed terms first.';return;}
  const g=generation,id=getUserId(),q=current;if(new Date(q.expiresAt)<=new Date()){changed();status.textContent='Quote expired. Calculate again.';return;}
  pending=pending?.quoteId===q.quoteId?pending:{quoteId:q.quoteId,requestKey:globalThis.crypto.randomUUID()};buy.disabled=true;
  try{const result=await request('/api/billing/calling-plans',{...pending,expectedTotalCents:q.totalCents,expectedFundingCents:q.fundingCents,acceptTerms:true});if(!valid(g,id))return;
   current=null;pending=null;terms.checked=false;summary.replaceChildren(node('p',result.invoiceId?'Plan created. Pay the funding invoice below; credit is added only after verified payment.':'Plan active against your existing calling balance. No extra charge was made.'));
   if(result.invoiceId)await paymentButtons(summary,result.invoiceId,g,id);await loadPlans();await refreshBilling();
  }catch(e){if(valid(g,id)){status.textContent=e.message;buy.disabled=!current;}}
 }
 async function loadPlans(){const g=generation,id=getUserId();if(!id)return;try{
  const data=await get('/api/billing/calling-plans');if(!valid(g,id))return;history.replaceChildren(node('h3','My custom calling plans'),node('p',data.note));
  for(const plan of data.plans){const item=node('article');item.append(node('p',money(plan.budget_cents)+' / 30-day budget · '+plan.status+(plan.ends_at?' · ends '+new Date(plan.ends_at).toLocaleDateString():'')));
   history.append(item);if(plan.status==='awaiting_payment'&&plan.invoice_id)await paymentButtons(item,plan.invoice_id,g,id);
  }
 }catch(e){if(valid(g,id))status.textContent=e.message;}}
 panel.addEventListener('toggle',()=>{if(panel.open)void initialize();});
 const visibility=setInterval(()=>{const id=getUserId();if(id!==owner){owner=id;generation++;revision++;current=null;pending=null;catalogPromise=null;countryList=[];clearTimer(timer);rows.replaceChildren();summary.replaceChildren();history.replaceChildren();terms.checked=false;buy.disabled=true;status.textContent='';panel.open=false;}panel.hidden=!id;shortcuts.forEach(b=>b.hidden=!id);},1000);
 panel.hidden=!owner;shortcuts.forEach(b=>b.hidden=!owner);
 return {dispose(){disposed=true;generation++;clearInterval(visibility);clearTimer(timer);panel.remove();shortcuts.forEach(b=>b.remove());}};
}
