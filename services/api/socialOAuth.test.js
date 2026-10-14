import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSocialOAuth} from './socialOAuth.js';
import {publishSocialText} from './socialPublishing.js';
test('expired, foreign-owner and replayed states never exchange authorization codes',async()=>{
 const previous={...process.env};Object.assign(process.env,{SOCIAL_X_CLIENT_ID:'client',SOCIAL_X_CLIENT_SECRET:'secret',PROVIDER_CREDENTIAL_KEY:'a'.repeat(64),PUBLIC_ORIGIN:'https://sip.dobhrap.com'});
 try{for(const replay of [false,true]){let contacted=false;const result=await handleSocialOAuth({req:{method:'POST'},path:'/api/social/publishing/oauth/x/complete',user:{id:'owner',tenant_id:'tenant'},pool:{query:async(sql,args)=>{assert.equal(args[1],'owner');assert.equal(args[2],'x');return sql.startsWith('SELECT')?{rows:replay?[{verifier:'verifier'}]:[]}:{rowCount:0};}},send:(_,status)=>status,readJson:async()=>({state:'state',code:'secret-code'}),fetchImpl:async()=>{contacted=true;}});assert.equal(result,400);assert.equal(contacted,false);}}finally{process.env=previous;}
});
test('LinkedIn posts use the connected member identity and reviewed text',async()=>{
 const id=await publishSocialText('linkedin','member','token','Reviewed text',async(url,options)=>{assert.equal(url,'https://api.linkedin.com/v2/ugcPosts');const body=JSON.parse(options.body);assert.equal(body.author,'urn:li:person:member');assert.equal(body.specificContent['com.linkedin.ugc.ShareContent'].shareCommentary.text,'Reviewed text');return {ok:true,json:async()=>({id:'urn:li:share:123'})};});assert.equal(id,'urn:li:share:123');
});
