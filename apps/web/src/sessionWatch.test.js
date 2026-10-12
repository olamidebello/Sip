import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSessionWatch} from './sessionWatch.js';
test('session watcher ends revoked session once but ignores network errors',async()=>{
  const dom=new JSDOM('');let mode='offline',ended=0;
  const watch=createSessionWatch({window:dom.window,check:async()=>{if(mode==='offline')throw new Error('offline');return mode==='active';},onRevoked:async()=>ended++});
  try{watch.start();await watch.verify();assert.equal(ended,0);mode='active';await watch.verify();assert.equal(ended,0);mode='revoked';await watch.verify();await watch.verify();assert.equal(ended,1);}finally{watch.stop();dom.window.close();}
});
