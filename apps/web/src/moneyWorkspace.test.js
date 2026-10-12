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
