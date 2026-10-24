import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parse} from './vendor/acorn/acorn.mjs';
import vm from 'node:vm';
const fixture=`async function handler(req,res){
 const path=req.url;
 const flowrouteWebhook=path.startsWith('/api/webhooks/flowroute/');
 if(req.method!=='GET'&&req.headers.origin!==origin)return send(res,403,{error:'Invalid origin'});
 try{
  if(req.method!=='GET'){
   const limited=requestLimiter.check('client',20);
   if(!limited.allowed)return send(res,429,{error:'Too many requests'});
  }
  if(flowrouteWebhook)return await handleFlowrouteWebhook({req,res,path,pool,send});
  if(path==='/api/me'){
   const user=await currentUser(req);
   return send(res,200,{role:user?.role});
  }
  if(path.startsWith('/api/admin/')||path.startsWith('/api/pbx/')||path.startsWith('/api/support/')){
   const user=await currentUser(req);
   if(!user)return send(res,401,{error:'Sign in required'});
   return send(res,200,{role:user.role});
  }
  return send(res,404,{});
 }catch{return send(res,500,{});}
}`;
function patched(){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./feature-patch-engine.mjs',import.meta.url))],{input:JSON.stringify({operation:'server',text:fixture})+'\n',encoding:'utf8'});
 assert.equal(result.status,0);const response=JSON.parse(result.stdout);assert.equal(response.ok,true,JSON.stringify(response));return response.text;
}
const integrated=patched();
function app({user={role:'super_admin'},allowed=true,rate=true}={}){
 const calls=[];let source=integrated;const imports=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='ImportDeclaration');for(const n of imports.reverse())source=source.slice(0,n.start)+source.slice(n.end);
 const context=vm.createContext({origin:'https://sip.dobhrap.com',pool:{},readJson:async()=>({}),meetingSignaling:{},requestLimiter:{check(){calls.push('rate');return {allowed:rate};}},currentUser:async()=>user,adminRouteAllowed:async()=>allowed,adminGroupPolicy:async()=>({enabled:true,permissions:[]}),scopedAdminUser:async(_db,u,path)=>u.role==='admin'&&!path.startsWith('/api/admin/')?{...u,role:'user'}:u,send:(_r,status,body)=>({status,body}),handleQuickSignup:async()=>{calls.push('signup');return {status:201};},handleQuickProfile:async()=>({status:200}),handleAdminGroup:async()=>{calls.push('group');return {status:200};},handleFlowrouteWebhook:async args=>({status:200,origin:args.origin})});
 vm.runInContext(source+'\nthis.dispatch=handler;',context);
 return {calls,request:(path,method='GET',origin='https://sip.dobhrap.com')=>context.dispatch({url:path,method,headers:{origin}},{})};
}
test('generated feature routes preserve origin and rate checks',async()=>{
 const wrong=app();assert.equal((await wrong.request('/api/register/quick/start','POST','https://other.example')).status,403);assert.deepEqual(wrong.calls,[]);
 const limited=app({rate:false});assert.equal((await limited.request('/api/register/quick/start','POST')).status,429);assert.deepEqual(limited.calls,['rate']);
 const valid=app();assert.equal((await valid.request('/api/register/quick/start','POST')).status,201);assert.deepEqual(valid.calls,['rate','signup']);
});
test('generated administration gate respects role permissions, password change and passkey requirements',async()=>{
 for(const user of [null,{role:'super_admin',must_change_password:true},{role:'super_admin',passkeyGate:'enroll'}]){const a=app({user});assert.ok([401,403].includes((await a.request('/api/admin/system-admin-group','PUT')).status));assert.equal(a.calls.includes('group'),false);}
 const denied=app({user:{role:'admin'},allowed:false});assert.equal((await denied.request('/api/admin/system-admin-group')).status,403);assert.equal(denied.calls.includes('group'),false);
 const valid=app();assert.equal((await valid.request('/api/admin/system-admin-group','PUT')).status,200);assert.equal(valid.calls.includes('group'),true);
});
test('personal handlers receive scoped authority while account identity and SMS origin remain intact',async()=>{
 const a=app({user:{role:'admin'}});assert.equal((await a.request('/api/support/tickets')).body.role,'user');assert.equal((await a.request('/api/me')).body.role,'admin');
 assert.equal((await a.request('/api/webhooks/flowroute/token/sms')).origin,'https://sip.dobhrap.com');
 assert.equal((await a.request('/api/account/admin-access','PUT')).status,405);
});
