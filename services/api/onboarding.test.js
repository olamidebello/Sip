import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOnboarding } from './onboarding.js';

const registration={name:'Test User',email:'test@example.com',password:'long-test-password',phone:'+2348012345678',address1:'123 Main',city:'Lagos',region:'Lagos',postalCode:'100001',country:'NG'};

test('failed delivery leaves a pending registration accessible to verification and resend does not rotate an undelivered code',async t=>{
  const previous=Object.fromEntries(['RESEND_API_KEY','RESEND_FROM','OTP_HMAC_SECRET','RESEND_API_URL'].map(key=>[key,process.env[key]]));
  t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  let deliver=false;
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:deliver});t.after(()=>{globalThis.fetch=originalFetch;});
  Object.assign(process.env,{RESEND_API_KEY:'test',RESEND_FROM:'test@example.com',OTP_HMAC_SECRET:'x'.repeat(40),RESEND_API_URL:'http://127.0.0.1:9999/emails'});
  const queries=[];let userId;
  const db={query:async(sql,args)=>{
    queries.push(sql);
    if(sql.startsWith('INSERT INTO users'))userId=args[0];
    if(sql.startsWith('SELECT u.id,o.sent_at'))return {rowCount:1,rows:[{id:userId,sent_at:new Date(Date.now()-61000)}]};
    return {rowCount:1,rows:[]};
  },release(){}};
  const pool={query:async(sql)=>{queries.push(sql);return {rows:[{open_signup:true,allowed_domains:'[]'}]};},connect:async()=>db};
  const call=async(path,body)=>{let reply;await handleOnboarding({req:{method:'POST'},res:{},path,pool,origin:'http://127.0.0.1:5173',send:(_,status,data)=>{reply={status,data};},readJson:async()=>body});return reply;};
  const registered=await call('/api/register',registration);
  assert.equal(registered.status,202);assert.equal(registered.data.delivery,'failed');
  assert.ok(queries.some(sql=>sql.startsWith('UPDATE signup_otps SET sent_at=DATE_SUB')));
  const previousUpdates=queries.filter(sql=>sql.startsWith('UPDATE signup_otps')).length;
  const failed=await call('/api/register/resend',{email:registration.email});
  assert.equal(failed.status,503);
  assert.equal(queries.filter(sql=>sql.startsWith('UPDATE signup_otps')).length,previousUpdates);
  assert.equal(queries.at(-1),'ROLLBACK');
  deliver=true;
  const sent=await call('/api/register/resend',{email:registration.email});
  assert.equal(sent.status,200);
  assert.equal(queries.filter(sql=>sql.startsWith('UPDATE signup_otps')).length,previousUpdates+1);
});

test('registration email code verifies the account and creates its SIP identity',async t=>{
  const previous=Object.fromEntries(['RESEND_API_KEY','RESEND_FROM','OTP_HMAC_SECRET','RESEND_API_URL','SIP_CREDENTIAL_KEY','SIP_PROVISION_URL'].map(key=>[key,process.env[key]]));
  t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const originalFetch=globalThis.fetch;let mailedCode;
  globalThis.fetch=async(_,options)=>{mailedCode=/\b\d{6}\b/.exec(JSON.parse(options.body).text)?.[0];return {ok:true};};
  t.after(()=>{globalThis.fetch=originalFetch;});
  Object.assign(process.env,{RESEND_API_KEY:'test',RESEND_FROM:'test@example.com',OTP_HMAC_SECRET:'x'.repeat(40),RESEND_API_URL:'http://127.0.0.1:9999/emails'});
  delete process.env.SIP_CREDENTIAL_KEY;delete process.env.SIP_PROVISION_URL;
  let userId,storedHash,activated=false,account=false;
  const db={query:async(sql,args=[])=>{
    if(sql.startsWith('INSERT INTO users'))userId=args[0];
    if(sql.startsWith('INSERT INTO signup_otps'))storedHash=args[1];
    if(sql.startsWith('SELECT u.id,o.code_hash'))return {rows:[{id:userId,code_hash:storedHash,attempts:0,expires_at:new Date(Date.now()+600000)}]};
    if(sql.startsWith('UPDATE users SET status'))activated=true;
    if(sql.startsWith('SELECT domain,enabled FROM switch_tenants'))return {rows:[]};
    if(sql.startsWith('INSERT INTO sip_accounts'))account=true;
    return {rowCount:1,rows:[]};
  },release(){}};
  const pool={query:async(sql)=>sql.startsWith('SELECT open_signup')?{rows:[{open_signup:true,allowed_domains:'[]'}]}:{rows:account?[{user_id:userId}]:[]},connect:async()=>db};
  const call=async(path,body)=>{let reply;await handleOnboarding({req:{method:'POST'},res:{},path,pool,origin:'http://127.0.0.1:5173',send:(_,status,data)=>{reply={status,data};},readJson:async()=>body});return reply;};
  assert.equal((await call('/api/register',registration)).status,201);
  assert.match(mailedCode,/^\d{6}$/);
  assert.equal((await call('/api/register/verify',{email:registration.email,code:mailedCode})).status,200);
  assert.equal(activated,true);assert.equal(account,true);
});
