import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupCallingPlanBuilder} from './callingPlanBuilderUi.js';
const tick=()=>new Promise(r=>setTimeout(r,15));
const quoteId='11111111-1111-4111-8111-111111111111';
const quote={quoteId,expiresAt:new Date(Date.now()+600000).toISOString(),days:30,dailyMinutes:10,monthlyMinutes:300,totalCents:3900,existingBalanceCents:1000,fundingCents:2900,destinations:[{country:'NG',rateBasis:'Highest listed selling rate',dailyMinutes:10,monthlyMinutes:300,sellingRate:'0.130000',monthlyCents:3900}]};
function fixture({quoteResponse=async()=>quote}={}){
 const dom=new JSDOM('<section id="billing"></section><section id="product-store"></section>'),calls=[],navigations=[];let owner='user';
 const ui=setupCallingPlanBuilder({document:dom.window.document,getUserId:()=>owner,show:t=>calls.push(['show',t]),navigate:url=>navigations.push(url),setTimer:()=>1,clearTimer(){},get:async path=>{
  if(path.endsWith('/countries'))return {countries:[{country:'NG',callingCode:'234',exampleRequired:false},{country:'GH',callingCode:'233',exampleRequired:false}]};
  if(path==='/api/billing/calling-plans')return {plans:[],note:'Shared calling balance'};
  if(path==='/api/wallet/capabilities')return {invoiceCheckoutAvailable:true};
  if(path==='/api/marketplace/gateways')return {providers:[]};throw Error(path);
 },request:async(path,body)=>{calls.push([path,body]);if(path.endsWith('/quote'))return quoteResponse();if(path==='/api/billing/calling-plans')return {invoiceId:'invoice',status:'awaiting_payment'};if(path==='/api/payments/checkout')return {url:'https://checkout.stripe.com/c/pay'};throw Error(path);}});
 return {dom,d:dom.window.document,calls,navigations,ui,logout(){owner=null;},close(){ui.dispose();dom.window.close();}};
}
const find=(f,text)=>[...f.d.querySelectorAll('button')].find(b=>b.textContent===text);
async function open(f){find(f,'Build a plan').click();await tick();}
test('marketplace and billing have builder buttons and server calculation renders total',async()=>{
 const f=fixture();try{
  assert.equal(f.d.querySelectorAll('[data-build-calling-plan]').length,2);await open(f);find(f,'Calculate monthly plan').click();await tick();
  assert.equal(f.calls.find(([p])=>p.endsWith('/quote'))[1].destinations[0].dailyMinutes,10);
  assert.match(f.d.querySelector('#calling-plan-builder').textContent,/\$39.00 USD/);
  assert(find(f,'Create plan & fund $29.00'));
 }finally{f.close();}
});
test('purchase requires acceptance and sends only authoritative quote and displayed amounts',async()=>{
 const f=fixture();try{await open(f);find(f,'Calculate monthly plan').click();await tick();const buy=find(f,'Create plan & fund $29.00');buy.click();await tick();assert(!f.calls.some(([p])=>p==='/api/billing/calling-plans'));
  f.d.querySelector('#calling-plan-builder input[type=checkbox]').checked=true;buy.click();await tick();
  const body=f.calls.find(([p])=>p==='/api/billing/calling-plans')[1];assert.equal(body.quoteId,quoteId);assert.equal(body.expectedTotalCents,3900);assert.equal(body.expectedFundingCents,2900);assert.match(body.requestKey,/^[a-f0-9-]{36}$/);
  find(f,'Fund with stripe').click();await tick();assert.equal(f.navigations[0],'https://checkout.stripe.com/c/pay');
 }finally{f.close();}
});
test('changing projected usage invalidates purchase and clears accepted terms',async()=>{
 const f=fixture();try{await open(f);find(f,'Calculate monthly plan').click();await tick();f.d.querySelector('input[type=checkbox]').checked=true;
  const minutes=f.d.querySelector('[data-daily-minutes]');minutes.value='20';minutes.dispatchEvent(new f.dom.window.Event('input'));
  assert.equal(find(f,'Create plan & fund $29.00').disabled,true);assert.equal(f.d.querySelector('input[type=checkbox]').checked,false);
 }finally{f.close();}
});
test('late quote after user edits or logout cannot enable a stale purchase',async()=>{
 let resolve;const f=fixture({quoteResponse:()=>new Promise(r=>resolve=r)});try{
  await open(f);find(f,'Calculate monthly plan').click();await tick();const minutes=f.d.querySelector('[data-daily-minutes]');minutes.value='30';minutes.dispatchEvent(new f.dom.window.Event('input'));f.logout();resolve(quote);await tick();
  assert.equal(find(f,'Create plan & fund').disabled,true);
 }finally{f.close();}
});
