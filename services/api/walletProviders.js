import {handleProviderCredentials,providerCredentials} from './providerCredentials.js';
export async function verifyWalletProvider(provider,credentials,fetchImpl=fetch){
 if(!credentials||credentials.disabled)throw new Error('Provider is not configured or is disabled');
 if(!['sandbox','production'].includes(credentials.environment))throw new Error('Invalid provider environment');
 if(provider==='dwolla'){
  const base=credentials.environment==='sandbox'?'https://api-sandbox.dwolla.com':'https://api.dwolla.com';
  const response=await fetchImpl(base+'/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(credentials.clientId+':'+credentials.clientSecret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded',Accept:'application/vnd.dwolla.v1.hal+json'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(10000)});
  const result=await response.json();if(!response.ok||!result.access_token)throw new Error('Dwolla authentication failed');
 }else if(provider==='flutterwave'){
  const response=await fetchImpl('https://api.flutterwave.com/v3/banks/NG',{headers:{Authorization:'Bearer '+credentials.secretKey},signal:AbortSignal.timeout(10000)});
  const result=await response.json();if(!response.ok||result.status!=='success'||!Array.isArray(result.data))throw new Error('Flutterwave authentication failed');
 }else throw new Error('Unsupported provider');
 return {provider,connected:true,environment:credentials.environment,fundingAvailable:false,payoutAvailable:false,note:'Credentials verified. Customer verification, bank linking, transfer reconciliation and provider approval are required before wallet transactions can be enabled.'};
}
export async function handleWalletProviderAdmin(args){
 const {req,res,path,user,pool,send,fetchImpl}=args;
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const match=/^\/api\/admin\/wallet-providers\/(dwolla|flutterwave)\/verify$/.exec(path);
 if(match){
  if(req.method!=='POST')return send(res,405,{error:'POST required'});
  try{return send(res,200,await verifyWalletProvider(match[1],await providerCredentials(pool,user.tenant_id,match[1]),fetchImpl));}
  catch{return send(res,502,{error:'Provider connection check failed. Check credentials, environment and account access.'});}
 }
 return handleProviderCredentials(args);
}
