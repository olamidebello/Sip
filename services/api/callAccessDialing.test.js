import test from 'node:test';
import assert from 'node:assert/strict';
import {callAccess} from './callAccess.js';
const user={id:'caller',tenant_id:'tenant'};
function db({country='US',paid=true,internal=false}={}){return {query:async(sql)=>{
 let rows=[];
 if(sql.includes('SELECT a.user_id'))rows=internal?[{user_id:'peer',tenant_id:'tenant'}]:[];
 else if(sql.includes('SELECT 1 FROM sip_accounts'))rows=[{}];
 else if(sql.includes('SELECT p.country'))rows=[{country}];
 else if(sql.includes('FROM subscriptions'))rows=paid?[{}]:[];
 return {rows,rowCount:rows.length};
}};}
test('IDD, bare international, explicit plus and short local numbers reach external authorization',async()=>{
 for(const [input,country,expected] of [['3109515282','US','13109515282'],['011234805875044','US','234805875044'],['234805875044','US','234805875044'],['+234805875044','US','234805875044'],['123456789','NG','234123456789']]){
 assert.deepEqual(await callAccess(db({country}),user,`sip:${input}@sip.example`),{allowed:true,scope:'external',target:`sip:+${expected}@sip.example`});
 }
});
test('subscription and internal identity protections remain enforced',async()=>{
 assert.equal((await callAccess(db({paid:false}),user,'sip:011234805875044@sip.example')).allowed,false);
 assert.equal((await callAccess(db(),user,'sip:missing@sip.example')).allowed,false);
 assert.equal((await callAccess(db({internal:true}),user,'sip:1234@sip.example')).scope,'internal');
});
