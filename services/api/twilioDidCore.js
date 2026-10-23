import {randomUUID} from 'node:crypto';
export const isUuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export const isNumber=v=>typeof v==='string'&&/^\+[1-9]\d{7,14}$/.test(v);
export const providerBadge=name=>String(name||'').replace(/[^\p{L}\p{N}]/gu,'').slice(0,3).toUpperCase();
export function localRentalCents(data){
 if(data?.price_unit!=='USD')throw Error('Current USD provider rental pricing required');
 const rows=(data.phone_number_prices||[]).filter(r=>r.number_type==='local');
 if(rows.length!==1||!/^\d{1,6}(\.\d{1,8})?$/.test(rows[0].current_price||''))throw Error('Unambiguous local-number rental price required');
 const [a,b='']=rows[0].current_price.split('.'),units=BigInt(a)*100000000n+BigInt(b.padEnd(8,'0'));
 const cents=Number((units*130n+99999999n)/100000000n);
 if(!Number.isSafeInteger(cents)||cents<1||cents>1000000)throw Error('Rental price outside supported limits');
 return {monthlyCents:cents,providerCost:rows[0].current_price,currency:'USD',setupCents:0,markupPercent:30};
}
export function nextRental(ms,anchor=ms){const d=new Date(Number(ms)),day=new Date(Number(anchor)).getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.getTime();}
export function confirmedNumber(r,order){return /^PN[a-f0-9]{32}$/i.test(r?.sid||'')&&r.account_sid===order.account_sid&&r.phone_number===order.number_e164&&r.friendly_name==='Olamide '+order.id;}
export function definitiveRejection(e){return [400,401,403,404,409,422].includes(e?.status)&&Number.isInteger(e?.providerCode);}
export function twilioDidClient(c,fetcher=fetch){
 if(!/^AC[a-f0-9]{32}$/i.test(c?.accountSid||''))throw Error('Twilio account required');
 const pair=c.apiKeySid&&c.apiKeySecret?[c.apiKeySid,c.apiKeySecret]:[c.accountSid,c.authToken];if(!pair[1])throw Error('Twilio API credentials required');
 return async (operation,b={})=>{
  let method='GET',base='https://api.twilio.com/2010-04-01/Accounts/'+c.accountSid,path,form;
  if(operation==='available'){if(!['US','CA'].includes(b.country)||!isNumber(b.number))throw Error('Supported country and exact number required');path='/AvailablePhoneNumbers/'+b.country+'/Local.json?'+new URLSearchParams({PhoneNumber:b.number,Contains:b.number,VoiceEnabled:'true',PageSize:'20'});}
  else if(operation==='prices'){if(!['US','CA'].includes(b.country))throw Error('Country unsupported for automated checkout');base='https://pricing.twilio.com';path='/v1/PhoneNumbers/Countries/'+b.country;}
  else if(operation==='owned'){if(!isNumber(b.number))throw Error('Exact number required');path='/IncomingPhoneNumbers.json?'+new URLSearchParams({PhoneNumber:b.number,PageSize:'20'});}
  else if(operation==='buy'){if(!isNumber(b.number)||!isUuid(b.id)||!/^TK[a-f0-9]{32}$/i.test(b.trunkSid||''))throw Error('Number, order and approved trunk required');method='POST';path='/IncomingPhoneNumbers.json';form={PhoneNumber:b.number,FriendlyName:'Olamide '+b.id,TrunkSid:b.trunkSid};}
  else if(operation==='release'||operation==='fetch'){if(!/^PN[a-f0-9]{32}$/i.test(b.sid||''))throw Error('Number SID required');path='/IncomingPhoneNumbers/'+b.sid+'.json';if(operation==='release')method='DELETE';}
  else throw Error('Unsupported number operation');
  let r;try{r=await fetcher(base+path,{method,headers:{Authorization:'Basic '+Buffer.from(pair.join(':')).toString('base64'),...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:form?new URLSearchParams(form).toString():undefined,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('Provider submission uncertain; check order status before any new request');}
  if(r.status===204&&operation==='release')return {released:true};
  let data;try{data=await r.json();}catch{throw Error('Provider response unreadable; reconciliation required');}
  if(!r.ok){const e=Error('Twilio number operation rejected: HTTP '+r.status+(Number.isInteger(data?.code)?' code '+data.code:''));e.status=r.status;e.providerCode=data?.code;throw e;}
  return data;
 };
}

export async function lockOrder(pool,id,fn){const db=await pool.connect(),key='tw-did-'+id;let locked=false;try{locked=Number((await db.query('SELECT GET_LOCK($1,0) AS acquired',[key])).rows[0]?.acquired)===1;if(!locked)throw Error('Order busy; refresh its status');return await fn(db);}finally{try{if(locked)await db.query('SELECT RELEASE_LOCK($1)',[key]);}finally{db.release();}}}
export async function transaction(db,fn){await db.query('START TRANSACTION');try{const r=await fn();await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}}
export async function finalizePurchase(db,o,remote,now=Date.now()){
 if(!confirmedNumber(remote,o))throw Error('Remote allocation is not confirmed for this order');
 now=Number(o.submitted_ms)||now;
 await transaction(db,async()=>{
  const fresh=(await db.query('SELECT status FROM twilio_did_orders WHERE id=$1 FOR UPDATE',[o.id])).rows[0];
  if(fresh?.status==='allocated')return;
  if(!['submitting','unknown','purchased'].includes(fresh?.status))throw Error('Order cannot be allocated from current state');
  const balance=(await db.query('SELECT balance_cents FROM wallet_accounts WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[o.user_id,o.tenant_id])).rows[0];
  await db.query("INSERT INTO invoices(id,user_id,description,amount_cents,status) VALUES($1,$2,$3,$4,'paid')",[o.invoice_id,o.user_id,'TWI '+o.number_e164+' first calendar month',Number(o.monthly_cents)]);
  await db.query('INSERT INTO wallet_purchases(id,tenant_id,user_id,invoice_id,amount_cents,balance_after_cents) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),o.tenant_id,o.user_id,o.invoice_id,Number(o.monthly_cents),Number(balance.balance_cents)]);
  await db.query('INSERT INTO twilio_did_periods(order_id,period_ms,invoice_id,amount_cents) VALUES($1,$2,$3,$4)',[o.id,now,o.invoice_id,Number(o.monthly_cents)]);
  await db.query("UPDATE twilio_did_orders SET status='allocated',resource_sid=$1,rental_until_ms=$2 WHERE id=$3",[remote.sid,nextRental(now),o.id]);
 });
}
// Exactly one POST after the durable debit/submitting state. A crash/timeout does
// not return the order to quoted and never authorizes a second provider attempt.
export async function submitPurchase(db,o,request){
 const claim=await db.query("UPDATE twilio_did_orders SET post_claimed=TRUE WHERE id=$1 AND status='submitting' AND post_claimed=FALSE",[o.id]);
 if(claim.rowCount!==1)throw Error('Purchase already submitted or requires reconciliation; no retry was sent');
 let result;
 try{result=await request('buy',{number:o.number_e164,id:o.id,trunkSid:o.trunk_sid});}
 catch(e){if(definitiveRejection(e)){
   await transaction(db,async()=>{
    const fresh=(await db.query('SELECT status FROM twilio_did_orders WHERE id=$1 FOR UPDATE',[o.id])).rows[0];if(fresh?.status!=='submitting')throw Error('Rejection state requires review');
    await db.query('UPDATE wallet_accounts SET balance_cents=balance_cents+$1 WHERE user_id=$2 AND tenant_id=$3',[Number(o.monthly_cents),o.user_id,o.tenant_id]);
    await db.query("UPDATE twilio_did_orders SET status='rejected' WHERE id=$1",[o.id]);
    await db.query('DELETE FROM twilio_did_number_locks WHERE order_id=$1',[o.id]);
   });throw e;
  }
  await db.query("UPDATE twilio_did_orders SET status='unknown' WHERE id=$1 AND status='submitting'",[o.id]);return {id:o.id,status:'unknown',note:'Wallet funds remain reserved. No automatic retry; super admin must reconcile.'};
 }
 if(!confirmedNumber(result,o)){await db.query("UPDATE twilio_did_orders SET status='unknown' WHERE id=$1 AND status='submitting'",[o.id]);return {id:o.id,status:'unknown'};}
 await db.query("UPDATE twilio_did_orders SET status='purchased',resource_sid=$1 WHERE id=$2 AND status='submitting'",[result.sid,o.id]);
 await finalizePurchase(db,o,result);return {id:o.id,status:'allocated',number:o.number_e164,provider:'twilio',serviceAcceptance:'Routing and two-way media require acceptance testing'};
}
