import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
export const paymentKey=()=>/^[0-9a-f]{64}$/i.test(process.env.PAYMENT_CONFIG_KEY||'')?Buffer.from(process.env.PAYMENT_CONFIG_KEY,'hex'):null;
export function encryptPaymentSecret(value){const k=paymentKey();if(!k)throw Error('Payment encryption key unavailable');const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv);return Buffer.concat([iv,c.update(value,'utf8'),c.final(),c.getAuthTag()]);}
export function decryptPaymentSecret(value){const k=paymentKey();if(!k)throw Error('Payment encryption key unavailable');const data=Buffer.from(value),c=createDecipheriv('aes-256-gcm',k,data.subarray(0,12));c.setAuthTag(data.subarray(-16));return Buffer.concat([c.update(data.subarray(12,-16)),c.final()]).toString('utf8');}
export async function stripeGateway(pool,tenant){return (await pool.query('SELECT enabled,mode,secret_key_cipher,webhook_secret_cipher FROM payment_gateways WHERE tenant_id=$1',[tenant])).rows[0];}
export async function stripeRequest(gateway,path,{body,idempotencyKey,fetchImpl=fetch}={}){
 const response=await fetchImpl('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+decryptPaymentSecret(gateway.secret_key_cipher),...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},...(body?{body}:{}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw Error('Stripe request unavailable');return data;
}
