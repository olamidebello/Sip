import {randomUUID,createHash,createHmac} from 'node:crypto';
import {paymentKey,encryptPaymentSecret,decryptPaymentSecret} from './stripeGateway.js';
export const checkoutEvents=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function setupInput(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Setup options required');
 if(value.tenantId&&!uuid.test(value.tenantId))throw Error('Invalid workspace ID');
 const origin=new URL(value.origin||process.env.PUBLIC_ORIGIN);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Public HTTPS origin required');
 const min=value.minCents??100,max=value.maxCents??100000;
 if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||min<50||max<min||max>1000000)throw Error('Top-up limits must be between 50 and 1000000 USD cents');
 if(value.enableTopups!==undefined&&typeof value.enableTopups!=='boolean')throw Error('Boolean top-up setting required');
 if(value.secretKey&&(!/^sk_live_[A-Za-z0-9]{12,}$/.test(value.secretKey)||value.secretKey.length>300))throw Error('A live Stripe secret key is required by this integration');
 if(value.webhookSecret&&(!/^whsec_[A-Za-z0-9]{12,}$/.test(value.webhookSecret)||value.webhookSecret.length>300))throw Error('Invalid webhook signing secret');
 return {...value,origin:origin.origin,minCents:min,maxCents:max};
}
export async function configureStripe(pool,input,{fetcher=fetch}={}){
 const options=setupInput(input);if(!paymentKey())throw Error('Payment encryption key unavailable');
 const admins=await pool.query("SELECT u.id,u.tenant_id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.role='super_admin' AND u.status='active' AND t.status='active' AND ($1='' OR u.tenant_id=$1) AND ($2='' OR u.email=$2) ORDER BY u.id LIMIT 2",[options.tenantId||'',options.adminEmail||'']);
 if(admins.rows.length!==1)throw Error('Select exactly one active super admin with stripe_admin_email and/or stripe_tenant_id');
 const actor=admins.rows[0],tenant=actor.tenant_id,url=options.origin+'/api/webhooks/stripe/'+tenant;
 const db=await pool.connect();let locked=false;
 try{
  locked=Number((await db.query('SELECT GET_LOCK($1,0) AS acquired',['stripe-setup-'+tenant])).rows[0]?.acquired)===1;if(!locked)throw Error('Another Stripe setup is running');
  const existing=(await db.query('SELECT * FROM payment_gateways WHERE tenant_id=$1',[tenant])).rows[0];
  const secret=options.secretKey||(existing?decryptPaymentSecret(existing.secret_key_cipher):'');
  if(!/^sk_live_[A-Za-z0-9]{12,}$/.test(secret))throw Error('Save a live key in /etc/olamide/stripe-api-key or configure it in the payment admin GUI');
  async function api(path,{body,key}={}){
   let response;try{response=await fetcher('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+secret,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:new URLSearchParams(body)}:{}),signal:AbortSignal.timeout(15000)});}catch{throw Error('Stripe network request failed; retry setup with the same saved configuration');}
   if(!response.ok)throw Error('Stripe setup request rejected (HTTP '+response.status+'); check the key and account permissions');
   try{return await response.json();}catch{throw Error('Invalid Stripe acknowledgement');}
  }
  const account=await api('account');if(!/^acct_[A-Za-z0-9]+$/.test(account.id||'')||account.charges_enabled!==true)throw Error('Stripe account is not enabled to receive live payments; complete Stripe account activation');
  const balance=await api('balance');if(balance.livemode!==true)throw Error('Live Stripe account verification failed');
  await db.query(`CREATE TABLE IF NOT EXISTS stripe_gateway_setup (
   tenant_id CHAR(36) PRIMARY KEY,account_id VARCHAR(255) NOT NULL,webhook_url VARCHAR(512) NOT NULL,
   request_id CHAR(36) NOT NULL,endpoint_id VARCHAR(255) NULL,signing_secret_cipher VARBINARY(512) NULL,
   created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
  let state=(await db.query('SELECT * FROM stripe_gateway_setup WHERE tenant_id=$1',[tenant])).rows[0];
  if(state&&(state.account_id!==account.id||state.webhook_url!==url))throw Error('Saved setup belongs to a different Stripe account or URL; existing gateway preserved');
  if(!state){state={account_id:account.id,webhook_url:url,request_id:randomUUID()};await db.query('INSERT INTO stripe_gateway_setup(tenant_id,account_id,webhook_url,request_id) VALUES($1,$2,$3,$4)',[tenant,account.id,url,state.request_id]);}
  let endpoint,signingSecret;
  if(state.endpoint_id){
   endpoint=await api('webhook_endpoints/'+encodeURIComponent(state.endpoint_id));
   if(endpoint.url!==url||endpoint.livemode!==true||endpoint.metadata?.olamide_tenant!==tenant)throw Error('Managed webhook identity changed; existing gateway preserved');
   signingSecret=decryptPaymentSecret(state.signing_secret_cipher);
   const body=new URLSearchParams({disabled:'false'});checkoutEvents.forEach(e=>body.append('enabled_events[]',e));
   await api('webhook_endpoints/'+encodeURIComponent(state.endpoint_id),{body});
  }else{
   // Refuse unknown matching endpoints: Stripe only returns the signing secret on creation.
   let cursor='',pages=0;const matching=[];do{const list=await api('webhook_endpoints?limit=100'+(cursor?'&starting_after='+encodeURIComponent(cursor):''));
    const matches=(list.data||[]).filter(e=>e.url===url);
    matching.push(...matches);
    cursor=list.has_more?list.data?.at(-1)?.id:'';if(++pages>100)throw Error('Too many webhooks to inspect safely');
   }while(cursor);
   if(matching.length){
    if(matching.length!==1)throw Error('An existing webhook URL has multiple endpoints; reconcile duplicates in Stripe first');
    const candidate=matching[0];
    if(options.webhookSecret){
     if(candidate.livemode!==true||!/^we_[A-Za-z0-9]+$/.test(candidate.id||''))throw Error('Invalid existing live webhook');
     endpoint=candidate;signingSecret=options.webhookSecret;
     const body=new URLSearchParams({disabled:'false','metadata[olamide_tenant]':tenant,'metadata[olamide_setup]':state.request_id});checkoutEvents.forEach(e=>body.append('enabled_events[]',e));
     await api('webhook_endpoints/'+encodeURIComponent(endpoint.id),{body});
    }else if(candidate.metadata?.olamide_setup!==state.request_id){
     throw Error('An existing webhook uses this URL. Save its signing secret privately in /etc/olamide/stripe-webhook-secret to adopt it without deletion');
    }else if(Number(candidate.created)<Date.now()/1000-23*3600){throw Error('Webhook signing secret recovery window expired; save its signing secret privately to continue');}
   }
   if(!endpoint){
    const body=new URLSearchParams({url,description:'Olamide payments and wallet confirmations','metadata[olamide_tenant]':tenant,'metadata[olamide_setup]':state.request_id});checkoutEvents.forEach(e=>body.append('enabled_events[]',e));
    endpoint=await api('webhook_endpoints',{body,key:'olamide-webhook-'+state.request_id});
    if(!/^we_[A-Za-z0-9]+$/.test(endpoint.id||'')||endpoint.livemode!==true||endpoint.url!==url||!/^whsec_[A-Za-z0-9]+$/.test(endpoint.secret||''))throw Error('Webhook signing secret unavailable; existing gateway preserved');
    signingSecret=endpoint.secret;
   }
   // Persist the one-time signing secret before enabling the application gateway.
   await db.query('UPDATE stripe_gateway_setup SET endpoint_id=$1,signing_secret_cipher=$2 WHERE tenant_id=$3',[endpoint.id,encryptPaymentSecret(signingSecret),tenant]);
  }
  if(!/^whsec_[A-Za-z0-9]+$/.test(signingSecret||''))throw Error('Invalid saved webhook signing secret');
  await db.query('BEGIN');try{
   await db.query(`INSERT INTO payment_gateways(tenant_id,enabled,secret_key_cipher,webhook_secret_cipher,mode,updated_by) VALUES($1,TRUE,$2,$3,'live',$4) ON DUPLICATE KEY UPDATE enabled=TRUE,secret_key_cipher=VALUES(secret_key_cipher),webhook_secret_cipher=VALUES(webhook_secret_cipher),mode='live',updated_by=VALUES(updated_by)`,[tenant,encryptPaymentSecret(secret),encryptPaymentSecret(signingSecret),actor.id]);
   if(options.enableTopups!==false)await db.query(`INSERT INTO wallet_funding_policy(tenant_id,enabled,min_cents,max_cents,revision,updated_by) VALUES($1,TRUE,$2,$3,1,$4) ON DUPLICATE KEY UPDATE enabled=TRUE,min_cents=VALUES(min_cents),max_cents=VALUES(max_cents),revision=revision+1,updated_by=VALUES(updated_by)`,[tenant,options.minCents,options.maxCents,actor.id]);
   await db.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),tenant,actor.id,'stripe_gateway_automatic_setup']);await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}
  // Signed, unsupported probe validates public routing and the saved signing secret without creating a checkout or wallet credits.
  const probe=JSON.stringify({id:'evt_setup'+createHash('sha256').update(state.request_id).digest('hex').slice(0,20),object:'event',livemode:true,type:'olamide.setup.probe',data:{object:{}}}),timestamp=Math.floor(Date.now()/1000);
  const signature=createHmac('sha256',signingSecret).update(timestamp+'.'+probe).digest('hex');let response;
  try{response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${timestamp},v1=${signature}`},body:probe,signal:AbortSignal.timeout(15000)});}catch{throw Error('Gateway saved; public webhook connectivity check failed. Retry after fixing HTTPS routing');}
  if(!response.ok)throw Error('Gateway saved; public webhook rejected its signature or route (HTTP '+response.status+')');
  return {configured:true,mode:'live',tenantId:tenant,webhookUrl:url,endpointId:endpoint.id,topupsEnabled:options.enableTopups!==false,publicWebhookVerified:true};
 }finally{if(locked)await db.query('SELECT RELEASE_LOCK($1)',['stripe-setup-'+tenant]);db.release();}
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const {createDatabase}=await import('./db.js');let pool;try{let raw='';for await(const chunk of process.stdin){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw Error('Setup input too large');}pool=createDatabase(process.env.MYSQL_URL);console.log(JSON.stringify(await configureStripe(pool,JSON.parse(raw||'{}'))));}catch(e){console.error(e.message?.startsWith('Stripe')||e.message?.startsWith('Save ')||e.message?.startsWith('Select ')||e.message?.startsWith('Gateway ')||e.message?.startsWith('An existing')||e.message?.startsWith('Webhook ')||e.message?.startsWith('Saved setup')?e.message:'Stripe setup failed; existing payment data preserved. Check setup options, encryption key and database availability.');process.exitCode=1;}finally{if(pool)await pool.end();}
}
