import test from 'node:test';
import assert from 'node:assert/strict';
import {callAccess,parseSipTarget,activeSubscription,handleCallAccess} from './callAccess.js';
const user={id:'caller',tenant_id:'tenant'};
function pool({internal=[],local=false,paid=false}={}){return {query:async sql=>{
 const rows=sql.includes('SELECT a.user_id')?internal:sql.includes('SELECT 1 FROM sip_accounts')?(local?[{}]:[]):paid?[{}]:[];
 return {rows,rowCount:rows.length};
}};}
test('free accounts can call active users in their own tenant without a plan',async()=>{
 assert.deepEqual(await callAccess(pool({internal:[{tenant_id:'tenant'}]}),user,'sip:ol123@sip.example.com'),{allowed:true,scope:'internal'});
});
test('external calls require an active subscription and malformed SIP addresses fail closed',async()=>{
 for(const target of ['sip:alice@carrier.example','sip:+12025550123@sip.example.com'])assert.equal((await callAccess(pool({local:target.includes('sip.example')}),user,target)).allowed,false);
 assert.equal((await callAccess(pool({paid:true}),user,'sip:alice@carrier.example')).scope,'external');
 assert.equal((await callAccess(pool({paid:true,local:true}),user,'sip:+12025550123@sip.example.com')).allowed,true);
 for(const value of ['sip:x@host;transport=tcp','sip:x\'@host','sip:x@host/path','sip:x@host?redirect=foo'])assert.equal(parseSipTarget(value),null);
});
test('cross-tenant users and unknown local usernames cannot be reached even with a plan',async()=>{
 assert.equal((await callAccess(pool({paid:true,internal:[{tenant_id:'other'}]}),user,'sip:ol123@sip.example')).allowed,false);
 assert.equal((await callAccess(pool({paid:true,local:true}),user,'sip:missing@sip.example')).allowed,false);
});
test('subscription lookup is tenant-bound, active, and checks plan availability',async()=>{
 await activeSubscription({query:async(sql,params)=>{assert.match(sql,/s.status='active'/);assert.match(sql,/p.tenant_id=\$2/);assert.match(sql,/p.active=true/);assert.deepEqual(params,['caller','tenant']);return {rowCount:0};}},user);
});
test('HTTP authorization returns a useful billing link on rejection',async()=>{
 let response;await handleCallAccess({req:{method:'POST'},path:'/api/softphone/authorize',user,pool:pool(),readJson:async()=>({target:'sip:x@carrier'}),send:(_,status,body)=>{response={status,body};}});
 assert.equal(response.status,403);assert.equal(response.body.configurationUrl,'/#billing');
});
