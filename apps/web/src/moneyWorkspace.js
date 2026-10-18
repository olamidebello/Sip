export function dollarsToCents(value){
 const text=String(value).trim();if(!/^\d{1,7}(\.\d{1,2})?$/.test(text))throw new Error('Enter a USD amount with up to two decimal places');
 const [d,c='']=text.split('.'),amount=Number(d)*100+Number(c.padEnd(2,'0'));
 if(!Number.isSafeInteger(amount)||amount<1||amount>100000000)throw new Error('Amount must be between $0.01 and $1,000,000');return amount;
}
export function setupMoneyWorkspace({document,get,request,show,redirect=url=>location.assign(url),newId=()=>crypto.randomUUID()}){
 const $=id=>document.getElementById(id);let owner=null,version=0,tab='home',pendingTransfer,pendingRequest,reviewedRequest=null,loading=false;
 const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(cents)/100);
 const status=message=>{if($('money-status'))$('money-status').textContent=message;};
 function view(name){tab=name;for(const panel of document.querySelectorAll('[data-money-panel]'))panel.hidden=panel.dataset.moneyPanel!==name;for(const button of document.querySelectorAll('[data-money-tab]'))button.setAttribute('aria-current',button.dataset.moneyTab===name?'page':'false');}
 for(const b of document.querySelectorAll('[data-money-tab]'))b.onclick=()=>view(b.dataset.moneyTab);
 $('money-logout').onclick=()=>document.getElementById('logout').click();
 $('money-back').onclick=()=>show('chat');$('money-settings').onclick=()=>show('account');
 $('money-payout').onclick=()=>status('Bank withdrawals are not configured.');
 $('money-billing').onclick=()=>show('billing');$('money-refresh').onclick=()=>refresh();
 $('money-amount').oninput=()=>{$('money-pay-amount').textContent=moneyAmount();};
 function moneyAmount(){try{return money(dollarsToCents($('money-amount').value));}catch{return '$0';}}
 for(const b of document.querySelectorAll('[data-money-key]'))b.onclick=()=>{
  const input=$('money-amount'),key=b.dataset.moneyKey;
  if(key==='back')input.value=input.value.slice(0,-1);else if(key==='.'&&!input.value.includes('.'))input.value+='.';else if(/^\d$/.test(key)&&input.value.length<10)input.value+=key;
  input.dispatchEvent(new document.defaultView.Event('input'));
 };
 $('money-start-pay').onclick=()=>{view('pay');$('money-recipient').focus();};
 $('money-start-request').onclick=()=>{view('request');$('money-request-amount').value=$('money-amount').value;$('money-payer').focus();};
 function action(label,run){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{button.disabled=true;try{await run();}catch(e){status(e.message);}finally{button.disabled=false;}};return button;}
 async function checkout(invoiceId){const current=version;const result=await request('/api/payments/checkout',{invoiceId});if(current!==version||!owner)return;const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw new Error('Invalid payment provider URL');redirect(url.href);}
 async function refresh(){if(!owner||loading)return;loading=true;const current=version;
  try{const [wallet,requests,invoices,capabilities]=await Promise.all([get('/api/wallet'),get('/api/wallet/requests'),get('/api/billing/invoices'),get('/api/wallet/capabilities')]);if(current!==version)return;
   $('money-total').textContent=money(wallet.balanceCents);$('money-pay-amount').textContent=moneyAmount();
   $('money-funding').disabled=!capabilities.fundingAvailable;$('money-payout').disabled=!capabilities.payoutAvailable;
   $('money-provider-status').textContent=capabilities.invoiceCheckoutAvailable?`Stripe ${capabilities.mode} checkout available for invoices.`:'Online payments are not configured for this workspace.';
   $('money-funding-note').textContent=capabilities.fundingNote+' '+capabilities.payoutNote;
   const history=$('money-history');history.replaceChildren();
   for(const row of wallet.entries){const li=document.createElement('li'),title=document.createElement('strong'),stamp=document.createElement('small');title.textContent=`${row.type==='topup'?'Top Up':Number(row.delta_cents)>0?'Received':'Sent'} ${money(Math.abs(Number(row.delta_cents)))}`;stamp.textContent=new Date(row.created_at).toLocaleString();li.append(title,stamp);history.append(li);}if(!history.children.length)history.textContent='Your transactions will appear here.';
   const list=$('money-requests');list.replaceChildren();
   for(const row of requests.requests){const li=document.createElement('li');const incoming=row.payer_id===owner;li.textContent=`${incoming?'From '+row.requester_email:'To '+row.payer_email} · ${money(row.amount_cents)} · ${row.status}${row.note?' · '+row.note:''}`;
    if(row.status==='pending'){
     if(incoming)li.append(action('Review payment',async()=>{reviewedRequest={id:row.id,email:row.requester_email,amountCents:Number(row.amount_cents)};$('money-recipient').value=row.requester_email;$('money-amount').value=(Number(row.amount_cents)/100).toFixed(2);$('money-pay-amount').textContent=money(row.amount_cents);view('pay');status('Review the recipient and amount, then confirm payment.');}));
     li.append(action(incoming?'Decline':'Cancel',async()=>{await request('/api/wallet/requests/'+row.id,{action:incoming?'decline':'cancel'},'PUT');await refresh();}));
    }list.append(li);
   }if(!list.children.length)list.textContent='No payment requests yet.';
   const billList=$('money-invoices');billList.replaceChildren();
   for(const row of invoices.invoices){const li=document.createElement('li');li.textContent=`${row.description} · ${money(row.amount_cents)} · ${row.status}`;if(row.status==='unpaid'&&row.currency==='USD'&&Number(row.amount_cents)>0){const button=action(capabilities.mode==='test'?'Pay test invoice':'Pay invoice',()=>checkout(row.id));button.disabled=!capabilities.invoiceCheckoutAvailable;li.append(button);}billList.append(li);}if(!billList.children.length)billList.textContent='No invoices.';
  }catch(e){if(current===version)status(e.message);}finally{loading=false;if(current!==version&&owner)void refresh();}
 }
 async function submit(form,kind){const current=version;const button=form.querySelector('button[type=submit]');button.disabled=true;try{
  const amountCents=dollarsToCents(kind==='pay'?$('money-amount').value:$('money-request-amount').value);
  if(kind==='pay'){
   const payload={recipientEmail:$('money-recipient').value.trim().toLowerCase(),amountCents};if(reviewedRequest){if(payload.recipientEmail!==reviewedRequest.email||amountCents!==reviewedRequest.amountCents)throw new Error('Requested recipient and amount changed. Reopen the request to review it.');payload.requestId=reviewedRequest.id;}const signature=JSON.stringify(payload);
   if(!pendingTransfer||pendingTransfer.signature!==signature)pendingTransfer={signature,id:newId()};
   await request('/api/wallet/transfers',{...payload,idempotencyKey:pendingTransfer.id});if(current!==version)return;pendingTransfer=null;reviewedRequest=null;status('Transfer completed.');
  }else{
   const payload={payerEmail:$('money-payer').value.trim().toLowerCase(),amountCents,note:$('money-request-note').value};const signature=JSON.stringify(payload);
   if(!pendingRequest||pendingRequest.signature!==signature)pendingRequest={signature,id:newId()};
   await request('/api/wallet/requests',{...payload,idempotencyKey:pendingRequest.id});if(current!==version)return;pendingRequest=null;status('Payment request sent.');
  }form.reset();$('money-amount').value='';await refresh();view('activity');
 }catch(e){if(current===version)status(e.message);}finally{button.disabled=false;}}
 $('money-pay-form').onsubmit=e=>{e.preventDefault();return submit(e.currentTarget,'pay');};
 $('money-request-form').onsubmit=e=>{e.preventDefault();return submit(e.currentTarget,'request');};
 return {refresh,payContact(email,mode='pay'){if(!owner||typeof email!=='string'||!email.includes('@')||!show('money'))return false;pendingTransfer=null;reviewedRequest=null;$('money-recipient').value=email;$('money-payer').value=email;$('money-amount').value='';view(mode==='request'?'request':'home');if(mode==='request')$('money-request-amount').value='';status('Send or request money with '+email+'. Enter an amount, then choose Pay or Request.');$('money-amount').focus();return true;},start(user){owner=user.id;version++;$('money-profile-name').textContent=user.name||'';$('money-profile-email').textContent=user.email||'';view('home');void refresh();},stop(){owner=null;version++;pendingTransfer=pendingRequest=reviewedRequest=null;for(const id of ['money-profile-name','money-profile-email','money-history','money-requests','money-invoices','money-status'])$(id).textContent='';$('money-total').textContent='$0.00';$('money-pay-form').reset();$('money-request-form').reset();$('money-amount').value='';}};
}
