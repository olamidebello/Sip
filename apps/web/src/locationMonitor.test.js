import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocationMonitor} from './locationMonitor.js';
const flush=()=>new Promise(r=>setImmediate(r));
test('no geofence never starts GPS and stops its polling timer',async()=>{
 let gps=0,cleared=0;
 const m=createLocationMonitor({get:async()=>({restricted:false,allowsVpn:true}),post:async()=>{throw Error('no heartbeat needed');},geolocation:{watchPosition(){gps++;},getCurrentPosition(){gps++;}},interval:()=>1,clear:()=>cleared++});
 m.start();await flush();assert.equal(m.current().allowed,true);assert.equal(gps,0);m.stop();assert.equal(cleared,1);
});
test('fenced VPN-allowed users send fresh readings and stop watchers',async()=>{
 let sent,cleared=0;
 const p={coords:{latitude:1,longitude:2,accuracy:3},timestamp:Date.now()};
 const m=createLocationMonitor({get:async()=>({restricted:true,allowsVpn:true,allowed:false}),post:async(_,b)=>{sent=b;return {allowed:true,restricted:true};},geolocation:{watchPosition:()=>7,getCurrentPosition:ok=>ok(p),clearWatch:n=>{assert.equal(n,7);cleared++;}},interval:()=>1,clear:()=>{}});
 m.start();await flush();assert.equal(sent.source,'gps');assert.equal(m.current().allowed,true);m.stop();assert.equal(cleared,1);
});
