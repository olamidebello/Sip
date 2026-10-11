import test from 'node:test';
import assert from 'node:assert/strict';
import {rateDownloadUrl,boundedText,syncRateDecks} from './flowrouteRateSync.js';
test('official CSV discovery rejects untrusted hosts and unexpected filenames',()=>{
  const url='https://flowroute.com/wp-content/uploads/2026/09/flowroute_default_rate.csv';
  assert.equal(rateDownloadUrl(`<a href="${url}">Rates</a>`),url);
  assert.throws(()=>rateDownloadUrl('<a href="https://evil.example/rates.csv">Rates</a>'));
  assert.throws(()=>rateDownloadUrl('<a href="https://flowroute.com.evil.example/wp-content/uploads/2026/09/flowroute_default_rate.csv">Rates</a>'));
});
test('download is bounded before reading huge content',async()=>{
  await assert.rejects(boundedText(new Response('x',{headers:{'content-length':'99999999'}})));
});
test('replica skips syncing when another replica owns the lock',async()=>{
  let released=false;
  await syncRateDecks({connect:async()=>({query:async()=>({rows:[{acquired:0}]}),release:()=>{released=true;}})},()=>{throw Error('Must not fetch');});
  assert.equal(released,true);
});
