import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleEmailConfiguration,verificationSender} from './emailConfiguration.js';

test('super administrator stores an encrypted write-only key and tests delivery', async()=>{
  const previous=process.env.EMAIL_CONFIG_KEY;
  process.env.EMAIL_CONFIG_KEY='a'.repeat(64);
  let stored=null,delivered=null;
  const originalFetch=globalThis.fetch;
  const pool={async query(sql,params=[]){
    if(sql.startsWith('SELECT'))return {rowCount:stored?1:0,rows:stored?[stored]:[]};
    if(sql.startsWith('INSERT INTO email_verification_configuration')){
      stored={secret_cipher:params[0],sender:params[1],updated_at:new Date()};
    }
    if(sql.startsWith('DELETE FROM email_verification_configuration'))stored=null;
    return {rowCount:1,rows:[]};
  }};
  const user={id:'00000000-0000-4000-8000-000000000001',tenant_id:'00000000-0000-4000-8000-000000000001',role:'super_admin',email:'admin@example.com'};
  const call=async(method,path,body,actor=user)=>{
    let response;
    await handleEmailConfiguration({req:{method},res:{},path,user:actor,pool,
      send(_res,status,data){response={status,data};return response;},
      readJson:async()=>body,origin:'https://sip.example.com'});
    return response;
  };
  try{
    const apiKey='re_abcdefghijklmnopqrstuv';
    assert.equal((await call('PUT','/api/admin/email-verification',{apiKey,sender:'verify@example.com'}, {...user,role:'user'})).status,403);
    assert.equal(stored,null);
    assert.equal((await call('PUT','/api/admin/email-verification',{apiKey,sender:'verify@example.com'})).status,200);
    assert.equal(Buffer.from(stored.secret_cipher).includes(Buffer.from(apiKey)),false);
    const status=await call('GET','/api/admin/email-verification');
    assert.equal(status.data.configured,true);
    assert.equal(JSON.stringify(status).includes(apiKey),false);
    assert.deepEqual(await verificationSender(pool),{apiKey,from:'verify@example.com'});
    globalThis.fetch=async(url,options)=>{delivered={url,options};return {ok:true};};
    assert.equal((await call('POST','/api/admin/email-verification/test')).status,200);
    assert.equal(delivered.url,'https://api.resend.com/emails');
    assert.equal(JSON.parse(delivered.options.body).to[0],user.email);
  }finally{
    globalThis.fetch=originalFetch;
    if(previous===undefined)delete process.env.EMAIL_CONFIG_KEY;else process.env.EMAIL_CONFIG_KEY=previous;
  }
});
