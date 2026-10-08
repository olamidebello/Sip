import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCsv,markedRate} from './flowrouteRates.js';
const head='Destination,Prefix,First Interval,Sub Interval,Default,Interstate Rate,Intrastate Rate,Status,Start Date\r\n';
test('30 percent markup retains six decimal places',()=>{
  assert.equal(markedRate('0.008330'),'0.010829');
  assert.equal(markedRate('1.179000'),'1.532700');
});
test('quoted destination and duplicate prefixes are validated',()=>{
  const row='"CANADA, MOBILE",1204,6,6,0.008330,0.008330,0.008330,Current,2026-01-01 00:00:00\r\n';
  assert.equal(parseCsv(head+row)[0].destination,'CANADA, MOBILE');
  assert.throws(()=>parseCsv(head+row+row),/duplicate prefix/);
  assert.throws(()=>parseCsv(head+row.replace('Current','Expired')),/Invalid or duplicate/);
});
