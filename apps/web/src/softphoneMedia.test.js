import test from 'node:test';
import assert from 'node:assert/strict';
import {softphoneMediaOptions} from './softphoneMedia.js';
test('authenticated UDP and TCP TURN credentials reach the SIP peer connection',()=>{const servers=[{urls:['turn:turn.example.com:3478?transport=udp','turn:turn.example.com:3478?transport=tcp'],username:'temporary',credential:'ephemeral'}];const r=softphoneMediaOptions({iceServers:servers});assert.deepEqual(r.peerConnectionConfiguration.iceServers,servers);assert.equal(r.peerConnectionConfiguration.iceTransportPolicy,'all');assert.equal(r.iceGatheringTimeout,8000);});
test('without configured TURN retain direct connectivity; invalid responses rejected',()=>{assert.deepEqual(softphoneMediaOptions({iceServers:[]}).peerConnectionConfiguration.iceServers,[]);assert.throws(()=>softphoneMediaOptions(null));});
