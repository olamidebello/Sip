import test from 'node:test';
import assert from 'node:assert/strict';
import {handleGeofenceAddress} from './geofenceAddress.js';
const run=overrides=>handleGeofenceAddress({req:{method:'POST'},res:{},user:{role:'super_admin'},send:(_,status,body)=>({status,body}),readJson:async()=>({address:'Lagos Nigeria'}),endpoint:'https://geo.example/search',...overrides});
test('address resolution rejects non-super admins before reading input',async()=>{const r=await run({user:{role:'admin'},readJson:()=>{throw Error('must not read')}});assert.equal(r.status,403);});
test('missing provider returns actionable configuration error',async()=>{assert.equal((await run({endpoint:''})).status,503);});
test('lookup normalizes results and rejects invalid coordinates',async()=>{const r=await run({fetchImpl:async url=>{assert.equal(url.searchParams.get('q'),'Lagos Nigeria');return {ok:true,json:async()=>[{lat:'6.5',lon:'3.4',display_name:'Lagos'},{lat:'100',lon:'2'}]};}});assert.deepEqual(r.body.results,[{latitude:6.5,longitude:3.4,label:'Lagos'}]);});
test('provider failure does not leak provider details',async()=>{const r=await run({fetchImpl:async()=>{throw Error('private endpoint')}});assert.equal(r.status,502);assert.ok(!r.body.error.includes('private'));});
test('public donated service is not used implicitly',async()=>{assert.equal((await run({endpoint:'https://nominatim.openstreetmap.org/search',fetchImpl:()=>{throw Error('must not fetch')}})).status,502);});
