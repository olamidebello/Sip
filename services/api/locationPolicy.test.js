import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveVpn,evaluateLocation,serviceLocationAccess,lookupIp,handleLocationPolicy} from './locationPolicy.js';
const fence={enabled:true,maxAccuracyMeters:100,zones:[{latitude:32.8,longitude:-96.8,radiusMeters:1000}]};
test('VPN defaults to yes, group denial wins, explicit user override wins',()=>{
 assert.deepEqual(effectiveVpn(null,[]),{allowsVpn:true,source:'default'});
 assert.equal(effectiveVpn(null,[1,0]).allowsVpn,false);assert.equal(effectiveVpn(1,[0]).allowsVpn,true);assert.equal(effectiveVpn(0,[1]).allowsVpn,false);
});
test('no configured fence grants service without a position',()=>{
 assert.equal(evaluateLocation({enabled:false},null).allowed,true);
 assert.equal(evaluateLocation({enabled:true,zones:[]},null).allowed,true);
});
test('fence checks movement and uncertainty conservatively',()=>{
 assert.equal(evaluateLocation(fence,{latitude:32.8,longitude:-96.8,accuracy:10}).allowed,true);
 assert.equal(evaluateLocation(fence,{latitude:33,longitude:-96.8,accuracy:10}).allowed,false);
 assert.equal(evaluateLocation(fence,{latitude:32.8,longitude:-96.8,accuracy:101}).allowed,false);
 assert.equal(evaluateLocation(fence,{latitude:NaN,longitude:0,accuracy:0}).allowed,false);
});
function database(lease){return {query:async(sql,args)=>{
 if(sql.includes('tenant_geofence_policy'))return {rows:[{policy:fence}]};
 if(sql.startsWith('SELECT allows_vpn'))return {rows:[]};
 if(sql.includes('group_vpn_policy'))return {rows:[]};
 if(sql.includes('FROM location_service_leases')){assert.ok(args.includes('session'));assert.match(sql,/ip_hash/);assert.match(sql,/JOIN sessions/);return {rows:lease&&lease.expires_ms>args[3]?[lease]:[]};}
 throw Error('Unexpected query');
}};}
test('session and IP bound leases expire and location is re-evaluated',async()=>{
 const lease={source:'gps',latitude:32.8,longitude:-96.8,accuracy:10,expires_ms:10000};
 const args={sessionHash:'session',ip:'1.2.3.4',now:9999};
 assert.equal((await serviceLocationAccess(database(lease),'t','u',args)).allowed,true);
 assert.equal((await serviceLocationAccess(database(lease),'t','u',{...args,now:10001})).allowed,false);
 assert.equal((await serviceLocationAccess(database({...lease,latitude:40}),'t','u',args)).allowed,false);
});
test('only super-admin may change user/group VPN policies',async()=>{
 const r=await handleLocationPolicy({path:'/api/admin/location-policy',user:{role:'admin'},send:(_,code)=>code});assert.equal(r,403);
});
test('IP lookup is server-configured and rejects classified VPNs',async()=>{
 const old=process.env.LOCATION_IP_LOOKUP_URL;
 try{
 delete process.env.LOCATION_IP_LOOKUP_URL;await assert.rejects(()=>lookupIp('1.2.3.4'),/not configured/);
 process.env.LOCATION_IP_LOOKUP_URL='https://location.example/lookup';
 await assert.rejects(()=>lookupIp('1.2.3.4',async()=>({ok:true,json:async()=>({isVpn:true,latitude:0,longitude:0,accuracy:1})})),/VPN connections/);
 const p=await lookupIp('1.2.3.4',async url=>{assert.equal(url.searchParams.get('ip'),'1.2.3.4');return {ok:true,json:async()=>({isVpn:false,latitude:32.8,longitude:-96.8,accuracy:10})};});assert.equal(p.isVpn,false);
 }finally{if(old===undefined)delete process.env.LOCATION_IP_LOOKUP_URL;else process.env.LOCATION_IP_LOOKUP_URL=old;}
});
test('heartbeat ignores client source selection when VPN disabled',async()=>{
 const old=process.env.LOCATION_IP_LOOKUP_URL;delete process.env.LOCATION_IP_LOOKUP_URL;
 const db={query:async sql=>sql.includes('tenant_geofence_policy')?{rows:[{policy:fence}]}:sql.startsWith('SELECT allows_vpn')?{rows:[{allows_vpn:0}]}:{rows:[]}};
 try{const r=await handleLocationPolicy({req:{method:'POST'},path:'/api/location/heartbeat',user:{id:'u',tenant_id:'t'},pool:db,sessionHash:'session',ip:'1.2.3.4',readJson:async()=>({source:'gps',latitude:32.8,longitude:-96.8,accuracy:1,timestamp:Date.now()}),send:(_,code,body)=>({code,body})});assert.equal(r.code,403);assert.match(r.body.error,/not configured/);}finally{if(old!==undefined)process.env.LOCATION_IP_LOOKUP_URL=old;}
});

test('no-fence server access does not require any session lease',async()=>{
 let leases=0;const db={query:async sql=>{if(sql.includes('location_service_leases'))leases++;return {rows:[]};}};
 assert.equal((await serviceLocationAccess(db,'tenant','user')).allowed,true);assert.equal(leases,0);
});
test('admin policy writes verify target tenant before mutation',async()=>{
 const calls=[];const db={release(){},query:async(sql,a)=>{calls.push([sql,a]);return {rows:[],rowCount:0};}};
 const target='22222222-2222-4222-8222-222222222222';
 const r=await handleLocationPolicy({req:{method:'PUT'},path:'/api/admin/location-policy/users/'+target,user:{role:'super_admin',tenant_id:'tenant'},pool:{connect:async()=>db},readJson:async()=>({allowsVpn:false}),send:(_,code)=>code});
 assert.equal(r,404);assert.deepEqual(calls[1][1],[target,'tenant']);assert.ok(!calls.some(([s])=>s.startsWith('INSERT')));
});

test('fenced SIP calls require a device lease proof and a bound session',async()=>{
 assert.equal((await serviceLocationAccess(database(null),'t','u',{requireProof:true})).allowed,false);
 assert.equal((await serviceLocationAccess(database(null),'t','u',{requireSession:true})).allowed,false);
 const proof='a'.repeat(64),base=database(null);
 const db={query:async(sql,args)=>{if(sql.includes('FROM location_service_leases')){assert.match(sql,/l.lease_proof=/);assert.ok(args.includes(proof));return {rows:[{session_hash:'bound-session',source:'gps',latitude:32.8,longitude:-96.8,accuracy:10,expires_ms:Date.now()+10000}]};}return base.query(sql,args);}};
 const result=await serviceLocationAccess(db,'t','u',{requireProof:true,proof});assert.equal(result.allowed,true);assert.equal(result.leaseSessionHash,'bound-session');
});
