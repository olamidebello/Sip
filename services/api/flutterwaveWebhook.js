import {createHash,timingSafeEqual} from 'node:crypto';
import {providerCredentials} from './providerCredentials.js';
import {reconcileStorePayment} from './storeGateways.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validFlutterwaveHash(header,secret){
 if(typeof header!=='string'||typeof secret!=='string'||secret.length<32)return false;
 const digest=value=>createHash('sha256').update(value).digest();
 return timingSafeEqual(digest(header),digest(secret));
}
export async function handleFlutterwaveWebhook({req,res,path,pool,send,fetchImpl=fetch}){
 if(req.method!=='POST')return send(res,405,{error:'POST required'});
 const tenant=/^\/api\/webhooks\/flutterwave\/([^/]+)$/.exec(path)?.[1];
 if(!uuid.test(tenant||''))return send(res,404,{error:'Webhook unavailable'});
 const credentials=await providerCredentials(pool,tenant,'flutterwave');
 if(!credentials||credentials.disabled)return send(res,503,{error:'Webhook unavailable'});
 if(!validFlutterwaveHash(req.headers['verif-hash'],credentials.webhookSecret))
  return send(res,401,{error:'Invalid webhook signature'});
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>1024*1024)return send(res,413,{error:'Webhook too large'});chunks.push(Buffer.from(chunk));}
 let event;try{event=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(res,400,{error:'Invalid JSON'});}
 if(!event||typeof event!=='object'||Array.isArray(event))return send(res,400,{error:'Invalid event'});
 if(event.event!=='charge.completed'||event.data?.status!=='successful')return send(res,200,{received:true,ignored:true});
 const reference=event.data?.tx_ref;
 if(!uuid.test(reference||''))return send(res,200,{received:true,ignored:true});
 const attempt=(await pool.query("SELECT * FROM payment_attempts WHERE id=$1 AND tenant_id=$2 AND provider='flutterwave'",[reference,tenant])).rows[0];
 // Unrelated Flutterwave charges must never create local invoices or wallet credit.
 if(!attempt)return send(res,200,{received:true,ignored:true});
 if(attempt.status==='paid')return send(res,200,{received:true,duplicate:true});
 // The existing reconciler checks provider status, reference, amount and currency,
 // then locks the invoice and attempt in one transaction for idempotent settlement.
 const result=await reconcileStorePayment(pool,attempt,{fetchImpl});
 return send(res,result.status===200?200:503,result.status===200?{received:true}:{error:'Payment verification pending; retry delivery'});
}
