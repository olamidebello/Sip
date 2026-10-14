import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePolicy,assignedIdentity,loadPolicy} from './outboundDids.js';
const tenant='11111111-1111-1111-1111-111111111111',user='22222222-2222-2222-2222-222222222222';
const assignment={userId:user,number:'+12145550123',provider:'flowroute',authorized:true,evidence:'Carrier assignment record'};
const policy=()=>({version:1,tenants:{[tenant]:{assignments:[{...assignment}]}}});
test('tenant/user mapping supplies trusted caller ID and rejects unassigned callers',()=>{
 const p=validatePolicy(policy());assert.equal(assignedIdentity(p,tenant,user).callerId,assignment.number);
 assert.throws(()=>assignedIdentity(p,tenant,'33333333-3333-3333-3333-333333333333'),/No authorized/);
 assert.equal(assignedIdentity(p,'other',user),null);
});
test('unverified, duplicate, and injected DIDs cannot be installed',()=>{
 for(const change of [{authorized:false},{number:'+12145550123\r\nEvil: true'},{evidence:''}]){const p=policy();Object.assign(p.tenants[tenant].assignments[0],change);assert.throws(()=>validatePolicy(p));}
 const p=policy();p.tenants[tenant].assignments.push({...assignment});assert.throws(()=>validatePolicy(p));
});
test('DIDWW cannot activate without approved IP-only and CLI configuration',()=>{
 const p=policy(),c=p.tenants[tenant];c.assignments[0].provider='didww';assert.throws(()=>validatePolicy(p));
 c.didww={ipOnlyApproved:true,allowedIpConfirmed:true,cliAuthorized:true,host:'nyc.us.out.didww.com',maxConcurrentCalls:10};
 assert.equal(assignedIdentity(validatePolicy(p),tenant,user).provider,'didww');
 c.didww.host='evil.example';assert.throws(()=>validatePolicy(p));
});
test('missing policy preserves legacy tenants; invalid existing policy does not silently fall back',()=>{
 assert.deepEqual(loadPolicy('/nonexistent/outbound-dids.json'),{version:1,tenants:{}});
 assert.throws(()=>loadPolicy(new URL('./package.json',import.meta.url)),/invalid/);
});

test('DIDWW reservation uses its own rate, trusted caller ID and persisted route',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {reservePstn}=await import('./pstnBilling.js');
 const dir=mkdtempSync(join(tmpdir(),'outbound-dids-')),path=join(dir,'policy.json');
 const p=policy(),c=p.tenants[tenant];c.assignments[0].provider='didww';c.didww={ipOnlyApproved:true,allowedIpConfirmed:true,cliAuthorized:true,host:'nyc.us.out.didww.com',maxConcurrentCalls:10};writeFileSync(path,JSON.stringify(p));
 const oldPath=process.env.OUTBOUND_DID_POLICY_FILE,oldEnable=process.env.KAMAILIO_PSTN_ENABLED;
 process.env.OUTBOUND_DID_POLICY_FILE=path;process.env.KAMAILIO_PSTN_ENABLED='true';
 const queries=[];let call;
 const db={release(){},async query(sql,a=[]){
  queries.push([sql,a]);
  if(sql.includes('FROM olamide_sip_call_access'))return {rows:[{tenant_id:tenant,user_id:user,external_calls:1}]};
  if(sql.includes('GET_LOCK'))return {rows:[{acquired:1}]};
  if(sql.startsWith('SELECT balance_cents'))return {rows:[{balance_cents:100,currency:'USD'}]};
  if(sql.startsWith('SELECT * FROM pstn_calls'))return {rows:call?[call]:[]};
  if(sql.startsWith('SELECT COUNT'))return {rows:[{n:0}]};
  if(sql.includes('FROM carrier_rate_rows')){assert.equal(a[2],'didww');return {rows:[{price_usd_per_minute:'0.010000',first_interval:60,sub_interval:60}]};}
  if(sql.startsWith('INSERT INTO pstn_calls'))call={user_id:user,tenant_id:tenant,destination:a[3],max_seconds:a[8],caller_id:a[9],provider:a[10],carrier_host:a[11],status:'reserved'};
  return {rows:[],rowCount:0};
 }};
 try{
  const pool={connect:async()=>db},data={caller:'user',domain:'sip.example',destination:'+12145550199',callKey:'a'.repeat(64)};
  const [status,body]=await reservePstn(pool,data);assert.equal(status,200);assert.equal(body.callerId,assignment.number);assert.equal(body.provider,'didww');assert.equal(body.carrierHost,c.didww.host);
  assert.equal((await reservePstn(pool,data))[1].callerId,assignment.number);
  assert.equal(queries.filter(([q])=>q.startsWith('UPDATE wallet_accounts')).length,1);
  c.assignments[0].number='+12145550125';writeFileSync(path,JSON.stringify(p));
  assert.equal((await reservePstn(pool,data))[0],403);
 }finally{
  if(oldPath===undefined)delete process.env.OUTBOUND_DID_POLICY_FILE;else process.env.OUTBOUND_DID_POLICY_FILE=oldPath;
  if(oldEnable===undefined)delete process.env.KAMAILIO_PSTN_ENABLED;else process.env.KAMAILIO_PSTN_ENABLED=oldEnable;
  rmSync(dir,{recursive:true,force:true});
 }
});
