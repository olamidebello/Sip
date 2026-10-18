import test from 'node:test';
import assert from 'node:assert/strict';
import {createRingback} from './ringback.js';
test('ringback starts once, pulses, and cleans up on stop',()=>{
 let starts=0,stops=0,clears=0,pulses=[];
 const context={state:'running',currentTime:0,destination:{},createGain:()=>({connect(){},disconnect(){},gain:{cancelScheduledValues(){},setValueAtTime:(v,t)=>pulses.push([v,t])}}),createOscillator:()=>({frequency:{},connect(){},start(){starts++;},stop(){stops++;},disconnect(){}})};
 const tone=createRingback({makeContext:()=>context,setTimer:(_,ms)=>{assert.equal(ms,6000);return 1;},clearTimer:()=>clears++});
 tone.start();tone.start();assert.equal(starts,2);assert.deepEqual(pulses,[[0.035,0],[0,2]]);
 tone.stop();tone.stop();assert.equal(stops,2);assert.equal(clears,1);
 tone.start();assert.equal(starts,4);tone.stop();
});
test('missing audio support never blocks calling',()=>{
 const tone=createRingback({makeContext:()=>{throw Error('unsupported');}});assert.doesNotThrow(()=>{tone.arm();tone.start();tone.stop();});
});
