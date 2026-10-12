import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWalletProvider,handleWalletProviderAdmin} from './walletProviders.js';
import {handleProviderCredentials,providerCredentials} from './providerCredentials.js';
test('Dwolla sandbox authenticates server side and never exposes access token',async()=>{
 const result=await verifyWalletProvider('dwolla',{environment:'sandbox',clientId:'key',clientSecret:'secret'},async(url,options)=>{assert.equal(url,'https://api-sandbox.dwolla.com/token');assert.equal(options.body,'grant_type=client_credentials');return {ok:true,json:async()=>({access_token:'private'})};});assert.equal(result.connected,true);assert.equal(result.fundingAvailable,false);assert.equal(JSON.stringify(result).includes('private'),false);
});
test('Flutterwave checks bank access without moving money',async()=>{const result=await verifyWalletProvider('flutterwave',{environment:'sandbox',secretKey:'secret'},async(url,options)=>{assert.equal(url,'https://api.flutterwave.com/v3/banks/NG');assert.equal(options.headers.Authorization,'Bearer secret');return {ok:true,json:async()=>({status:'success',data:[]})};});assert.equal(result.payoutAvailable,false);});
test('failed authentication and disabled providers fail closed',async()=>{await assert.rejects(verifyWalletProvider('dwolla',{disabled:true}));await assert.rejects(verifyWalletProvider('flutterwave',{environment:'production',secretKey:'bad'},async()=>({ok:false,json:async()=>({})})));});
test('ordinary admin cannot configure or verify wallet providers',async()=>{assert.equal((await handleWalletProviderAdmin({user:{role:'admin'},send:(_,code)=>code})),403);});
test('both wallet providers store encrypted tenant-bound secrets',async()=>{
 const old=process.env.PROVIDER_CREDENTIAL_KEY;process.env.PROVIDER_CREDENTIAL_KEY='a'.repeat(64);
 try{for(const [provider,credentials] of Object.entries({dwolla:{clientId:'key',clientSecret:'private-secret',environment:'sandbox'},flutterwave:{secretKey:'private-secret',webhookSecret:'hash',environment:'sandbox'}})){
 let ciphertext;const db={query:async(sql,args)=>{if(sql.startsWith('SELECT revision'))return {rows:[],rowCount:0};if(sql.includes('INSERT INTO provider_api_credentials'))ciphertext=args[2];return {rows:[],rowCount:1};},release(){}};const pool={connect:async()=>db,query:async()=>({rows:[{ciphertext,enabled:1}],rowCount:1})};
 const result=await handleProviderCredentials({req:{method:'PUT'},res:{},path:'/api/admin/wallet-providers/'+provider,user:{role:'super_admin',id:'admin',tenant_id:'tenant'},pool,send:(_,code)=>code,readJson:async()=>({...credentials,expectedRevision:0})});assert.equal(result,200);assert.equal(ciphertext.includes(Buffer.from('private-secret')),false);assert.deepEqual(await providerCredentials(pool,'tenant',provider),credentials);await assert.rejects(providerCredentials(pool,'other-tenant',provider));
 }}finally{if(old===undefined)delete process.env.PROVIDER_CREDENTIAL_KEY;else process.env.PROVIDER_CREDENTIAL_KEY=old;}
});
