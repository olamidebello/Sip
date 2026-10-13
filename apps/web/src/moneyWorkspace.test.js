import test from 'node:test';import assert from 'node:assert/strict';
import {appFixture} from '../navigationTestSupport.js';import {dollarsToCents} from './moneyWorkspace.js';
test('USD keypad preserves cents without floating-point rounding',()=>{assert.equal(dollarsToCents('0.29'),29);assert.equal(dollarsToCents('12.5'),1250);for(const value of ['0','-2','1.111','1e2','1000001','NaN'])assert.throws(()=>dollarsToCents(value));});
test('Money navigation keeps automatic SIP controller alive and routes transfers to backend',async()=>{
 const app=await appFixture();try{
  await app.signIn('user');const old=app.window.fetch;app.window.fetch=async(path,options)=>{
   if(path==='/api/wallet')return {ok:true,status:200,json:async()=>({balanceCents:5000,currency:'USD',entries:[]})};
   if(path==='/api/wallet/requests')return {ok:true,status:200,json:async()=>({requests:[]})};
   if(path==='/api/billing/invoices')return {ok:true,status:200,json:async()=>({invoices:[]})};
   if(path==='/api/wallet/capabilities')return {ok:true,status:200,json:async()=>({fundingAvailable:false,payoutAvailable:false,invoiceCheckoutAvailable:false,fundingNote:'Unavailable',payoutNote:'Unavailable'})};
   if(path==='/api/wallet/transfers'){app.calls.push({path,options});return {ok:true,status:201,json:async()=>({status:'completed'})};}return old(path,options);
  };
  const moneyLink=app.document.querySelector('.messenger-tabs a[href="/#money"]');assert.ok(moneyLink);moneyLink.click();
  await new Promise(r=>setTimeout(r,20));assert.ok(app.document.body.classList.contains('money-mode'));assert.equal(app.document.querySelector('#money-total').textContent,'$50.00');
  app.document.querySelector('#money-amount').value='2.29';app.document.querySelector('#money-start-pay').click();app.document.querySelector('#money-recipient').value='b@example.com';
  const form=app.document.querySelector('#money-pay-form');await form.onsubmit({preventDefault(){},currentTarget:form});
  const transfer=app.calls.find(c=>c.path==='/api/wallet/transfers');assert.equal(JSON.parse(transfer.options.body).amountCents,229);
  assert.equal(app.document.querySelector('#money-funding').disabled,true);assert.equal(app.document.querySelector('#money-payout').disabled,true);
  app.document.querySelector('#money-back').click();assert.equal(app.document.body.classList.contains('money-mode'),false);
 }finally{app.close();}
});
test('chat menu selects both Pay and Request without moving money',async()=>{
 const app=await appFixture();try{await app.signIn('user');const select=app.document.getElementById('contact-list');select.innerHTML='<option value="contact" data-email="friend@example.com">Friend</option>';await new Promise(r=>setTimeout(r,10));app.document.querySelector('.chat-menu-money').click();assert.equal(app.window.location.hash,'#money');assert.equal(app.document.getElementById('money-payer').value,'friend@example.com');assert.equal(app.document.getElementById('money-recipient').value,'friend@example.com');app.document.getElementById('money-amount').value='3.25';app.document.getElementById('money-start-request').click();assert.equal(app.document.getElementById('money-request-amount').value,'3.25');assert.ok(!app.calls.some(c=>c.path==='/api/wallet/transfers'));}finally{app.close();}
});
test('incoming request requires review and matching confirmation before transfer',async()=>{
 const app=await appFixture();try{await app.signIn('user');await new Promise(r=>setTimeout(r,20));const old=app.window.fetch;const me={id:'audit-user'};const row={id:'00000000-0000-4000-8000-000000000999',payer_id:me.id,requester_email:'friend@example.com',amount_cents:325,status:'pending'};
 app.window.fetch=async(path,options)=>{if(path==='/api/wallet')return {ok:true,status:200,json:async()=>({balanceCents:5000,entries:[]})};if(path==='/api/billing/invoices')return {ok:true,status:200,json:async()=>({invoices:[]})};if(path==='/api/wallet/capabilities')return {ok:true,status:200,json:async()=>({fundingAvailable:false,payoutAvailable:false})};if(path==='/api/wallet/requests')return {ok:true,status:200,json:async()=>({requests:[row]})};if(path==='/api/wallet/transfers'){app.calls.push({path,options});return {ok:true,status:201,json:async()=>({status:'completed'})};}return old(path,options);};
 await app.document.getElementById('money-refresh').onclick();const button=[...app.document.querySelectorAll('#money-requests button')].find(b=>b.textContent==='Review payment');assert.ok(button);await button.onclick();assert.ok(!app.calls.some(c=>c.path==='/api/wallet/transfers'));assert.equal(app.document.getElementById('money-amount').value,'3.25');const form=app.document.getElementById('money-pay-form');app.document.getElementById('money-amount').value='4';await form.onsubmit({preventDefault(){},currentTarget:form});assert.ok(!app.calls.some(c=>c.path==='/api/wallet/transfers'));app.document.getElementById('money-amount').value='3.25';await form.onsubmit({preventDefault(){},currentTarget:form});const transfer=app.calls.find(c=>c.path==='/api/wallet/transfers');assert.equal(JSON.parse(transfer.options.body).requestId,row.id);
 }finally{app.close();}
});
