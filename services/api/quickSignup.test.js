import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptQuickSignup,quickInput,quickSmsCode,normalizeQuickPhone,quickSignupDid,handleQuickSignup,handleQuickProfile} from './quickSignup.js';
import {defaultTenantId} from './tenancy.js';
const event={sender:'12065550100',recipient:quickSignupDid,body:'OLAMIDE 0123456789ABCDEF'};
function fixture({duplicate=false,claim=false,fail=false,closed=false,policy=null,existingEmail=false}={}){
 const calls=[];let pending=true,users=0,committed=0;
 const row={token_hash:'a'.repeat(64),email:'new@example.com',name:'New member',password_salt:'b'.repeat(64),password_hash:'c'.repeat(128)};
 const db={release(){calls.push(['release']);},async query(sql,args=[]){calls.push([sql,args]);let rows=[];
  if(sql.includes('GET_LOCK'))rows=[{acquired:1}];
  else if(sql.startsWith('SELECT * FROM quick_signups'))rows=pending?[row]:[];
  else if(sql.includes('SELECT policy,version'))rows=policy?[{policy,version:1}]:[];
  else if(sql.includes('SELECT open_signup'))rows=[{open_signup:!closed,allowed_domains:[]}];
  else if(sql.includes('SELECT id FROM tenants'))rows=[{id:defaultTenantId}];
  else if(sql.includes('SELECT user_id FROM user_profiles'))rows=duplicate?[{user_id:'existing'}]:[];
  else if(sql.includes('SELECT user_id FROM quick_verified_phones'))rows=claim?[{user_id:'existing'}]:[];
  else if(sql.startsWith('INSERT INTO users')){if(existingEmail)throw Object.assign(Error('duplicate'),{code:'ER_DUP_ENTRY'});users++;}
  else if(sql.includes('SELECT tenant_id FROM users'))rows=[{tenant_id:defaultTenantId}];
  else if(sql.startsWith('INSERT INTO sip_accounts')&&fail)throw Error('switch record failed');
  else if(sql.startsWith('UPDATE quick_signups'))pending=false;
  else if(sql==='COMMIT')committed++;
  else if(sql==='ROLLBACK'){pending=true;users=0;}
  return {rows,rowCount:rows.length||1};
 }};
 return {pool:{connect:async()=>db},calls,get users(){return users;},get committed(){return committed;}};
}
const context={tenantId:defaultTenantId,origin:'https://sip.dobhrap.com'};
test('SMS command parsing is strict and phone normalization uses carrier sender',()=>{
 assert.equal(quickSmsCode(' olamide 0123456789abcdef '),'0123456789ABCDEF');
 for(const s of ['Your code 0123456789ABCDEF','OLAMIDE 123456','OLAMIDE 0123456789ABCDEF extra'])assert.equal(quickSmsCode(s),undefined);
 assert.equal(normalizeQuickPhone('12065550100'),'+12065550100');assert.equal(normalizeQuickPhone('invalid'),null);
 assert.throws(()=>quickInput({email:'a@example.com',password:'short',confirmPassword:'short'}),/password/);
 assert.equal(quickInput({email:' A@EXAMPLE.COM ',password:'long-password-123',confirmPassword:'long-password-123'}).email,'a@example.com');
});
test('wrong DID, tenant, malformed code and self-message never access database',async()=>{
 const pool={connect(){throw Error('Must not connect');}};
 for(const e of [{...event,recipient:'+12065550101'},{...event,body:'hello'},{...event,sender:quickSignupDid}])assert.equal(await acceptQuickSignup(pool,e,context),false);
 assert.equal(await acceptQuickSignup(pool,event,{...context,tenantId:'other'}),false);
});
test('verified sender creates account, presence, group, SIP and claim atomically; code replay does nothing',async()=>{
 const f=fixture();assert.equal(await acceptQuickSignup(f.pool,event,context),true);assert.equal(f.users,1);
 const profile=f.calls.find(([s])=>s.startsWith('INSERT INTO user_profiles'));assert.equal(profile[1][1],'+12065550100');
 assert.ok(f.calls.some(([s])=>s.startsWith('INSERT INTO sip_accounts')));
 assert.ok(f.calls.some(([s])=>s.includes("state='verified',user_id")&&s.includes('password_hash=NULL')));
 assert.equal(await acceptQuickSignup(f.pool,event,context),false);assert.equal(f.users,1);
});
test('existing phone/email, closed policy, required PIN and prefix restrictions cannot activate',async()=>{
 for(const options of [{duplicate:true},{claim:true},{closed:true},{existingEmail:true},{policy:{signup:true,requirePin:true,allowedPrefixes:['+1']}},{policy:{signup:true,requirePin:false,allowedPrefixes:['+234']}}]){
  const f=fixture(options);assert.equal(await acceptQuickSignup(f.pool,event,context),false);assert.equal(f.users,0);
  assert.equal(f.calls.some(([s])=>s.startsWith('INSERT INTO sip_accounts')),false);
 }
});
test('SIP insertion failure rolls back the account and leaves challenge retryable',async()=>{
 const f=fixture({fail:true});await assert.rejects(acceptQuickSignup(f.pool,event,context),/switch record/);assert.equal(f.users,0);assert.equal(f.committed,0);assert.ok(f.calls.some(([s])=>s==='ROLLBACK'));assert.equal(f.calls.at(-1)[0],'release');
});
test('expired/missing challenges cannot activate an account',async()=>{
 const f=fixture();const db=await f.pool.connect(),old=db.query.bind(db);db.query=(s,a)=>s.startsWith('SELECT * FROM quick_signups')?Promise.resolve({rows:[]}):old(s,a);
 assert.equal(await acceptQuickSignup(f.pool,event,context),false);assert.equal(f.users,0);
 assert.match(f.calls.find(([s])=>s==='START TRANSACTION')[0],/START/);
});
test('status requires browser secret and reports expiry without exposing email, phone or credentials',async()=>{
 const prior=process.env.FLOWROUTE_WEBHOOK_TOKEN;process.env.FLOWROUTE_WEBHOOK_TOKEN='z'.repeat(64);
 try{let result;const ctx={req:{method:'POST'},res:{setHeader(){}},path:'/api/register/quick/status',send:(_r,status,body)=>{result={status,body};},pool:{query:async()=>({rows:[]})}};
 await handleQuickSignup({...ctx,readJson:async()=>({token:'bad'})});assert.equal(result.status,400);
 await handleQuickSignup({...ctx,readJson:async()=>({token:'a'.repeat(64)})});assert.equal(result.status,410);
 }finally{if(prior===undefined)delete process.env.FLOWROUTE_WEBHOOK_TOKEN;else process.env.FLOWROUTE_WEBHOOK_TOKEN=prior;}
});
test('profile completion requires authenticated owner',async()=>{
 let status;await handleQuickProfile({req:{method:'PUT'},res:{setHeader(){}},user:null,send:(_r,s)=>{status=s;},pool:{query(){throw Error('no database');}}});assert.equal(status,401);
});

test('start consumes CAPTCHA and stores only password/PIN and token/code hashes',async()=>{
 const {captchaHash}=await import('./signupCaptcha.js');
 const old=process.env.FLOWROUTE_WEBHOOK_TOKEN;process.env.FLOWROUTE_WEBHOOK_TOKEN='z'.repeat(64);
 try{
  const calls=[],id='12345678-1234-4234-8234-123456789012';let response;
  const db={release(){},async query(sql,args=[]){calls.push([sql,args]);let rows=[];
   if(sql.includes('GET_LOCK'))rows=[{acquired:1}];
   if(sql.includes('SELECT answer_hash'))rows=[{answer_hash:captchaHash(id,'234567'),expires_at:new Date(Date.now()+300000)}];
   if(sql.includes('SELECT open_signup'))rows=[{open_signup:true,allowed_domains:[]}];
   if(sql.includes('COUNT(*)'))rows=[{n:0}];
   return {rows,rowCount:1};
  }};
  await handleQuickSignup({req:{method:'POST'},res:{setHeader(){}},path:'/api/register/quick/start',pool:{connect:async()=>db,query:db.query},send:(_r,status,body)=>{response={status,body};},readJson:async()=>({email:'new@example.com',password:'strong-password-123',confirmPassword:'strong-password-123',pin:'839275',captchaId:id,captchaAnswer:'234567'})});
  assert.equal(response.status,201);assert.match(response.body.token,/^[a-f0-9]{64}$/);assert.match(response.body.message,/^OLAMIDE [A-F0-9]{16}$/);
  const stored=calls.find(([s])=>s.includes('INSERT INTO quick_signups'))[1];
  for(const secret of ['strong-password-123','839275',response.body.token,response.body.message.slice(8)])assert.equal(stored.includes(secret),false);
  assert.equal(calls.some(([s])=>s.startsWith('INSERT INTO users')),false);
 }finally{if(old===undefined)delete process.env.FLOWROUTE_WEBHOOK_TOKEN;else process.env.FLOWROUTE_WEBHOOK_TOKEN=old;}
});
test('authenticated webhook retry still activates after event ledger insertion was already recorded',async()=>{
 const {handleFlowrouteWebhook}=await import('./messagingWebhooks.js');const {Readable}=await import('node:stream');
 const old=process.env.FLOWROUTE_WEBHOOK_TOKEN;process.env.FLOWROUTE_WEBHOOK_TOKEN='z'.repeat(64);
 try{const f=fixture();f.pool.query=async()=>({rows:[],rowCount:0});let response;
 const req=Readable.from([JSON.stringify({data:{id:'mdr2-quick-signup',type:'message',attributes:{from:event.sender,to:event.recipient,body:event.body}}})]);req.method='POST';req.headers={'content-type':'application/json'};
 await handleFlowrouteWebhook({req,res:{},path:'/api/webhooks/flowroute/'+process.env.FLOWROUTE_WEBHOOK_TOKEN+'/sms',pool:f.pool,origin:context.origin,send:(_r,status,body)=>{response={status,body};}});
 assert.equal(response.status,200);assert.equal(response.body.duplicate,true);assert.equal(f.users,1);
 }finally{if(old===undefined)delete process.env.FLOWROUTE_WEBHOOK_TOKEN;else process.env.FLOWROUTE_WEBHOOK_TOKEN=old;}
});
