import {providerCredentials} from './providerCredentials.js';
export async function smsCredentials(pool,tenant,{load=providerCredentials,env=process.env}={}){
 const saved=await load(pool,tenant,'flowroute');
 if(saved?.disabled)throw Error('Flowroute messaging credentials disabled');
 const credentials=saved??{accessKey:env.FLOWROUTE_ACCESS_KEY,secretKey:env.FLOWROUTE_SECRET_KEY};
 if(typeof credentials.accessKey!=='string'||!credentials.accessKey.trim()||typeof credentials.secretKey!=='string'||!credentials.secretKey.trim())throw Error('Complete Flowroute messaging credentials required');
 return {accessKey:credentials.accessKey,secretKey:credentials.secretKey};
}
