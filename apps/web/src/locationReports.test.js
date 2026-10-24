import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupLocationReports} from './locationReports.js';
import {locationReportCsv} from './locationReportCsv.js';
test('location report shows profile address as text and clears it on signout',async()=>{
 const dom=new JSDOM('<section id="admin"></section>');const address='<img src=x onerror=alert(1)>, Lagos, NG';
 const ui=setupLocationReports({document:dom.window.document,get:async()=>({entries:[{userId:'one',name:'Person',recordedAt:'2026-10-24T12:00:00Z',latitude:6,longitude:3,accuracyMeters:20,profileAddress:address}],policy:{enabled:true,retentionDays:30}}),request:async()=>{}});
 ui.start({role:'super_admin'});await new Promise(setImmediate);
 assert.equal(dom.window.document.querySelector('tbody tr').lastElementChild.textContent,address);assert.equal(dom.window.document.querySelector('tbody img'),null);
 assert.match(dom.window.document.querySelector('thead').textContent,/Current profile address/);
 ui.stop();assert.equal(dom.window.document.querySelector('tbody').children.length,0);dom.window.close();
});
test('CSV exports full and structured profile addresses and neutralizes spreadsheet formulas',()=>{
 const csv=locationReportCsv([{userId:'one',name:'Person',profileAddress:'12 "Main", Lagos',address1:'12 "Main"',city:'Lagos',country:'NG'},{userId:'two',profileAddress:' =SUM(1,2)',address1:'\t+SUM(1,2)'}]);
 assert.match(csv,/"Current profile address"/);assert.match(csv,/"Address line 1"/);assert.ok(csv.includes('"12 ""Main"", Lagos"'));assert.ok(csv.includes('"\' =SUM(1,2)"'));assert.ok(csv.includes('"\'\t+SUM(1,2)"'));
});
test('missing addresses show Not provided and unprivileged users do not fetch location reports',async()=>{
 const dom=new JSDOM('<section id="admin"></section>');let calls=0;
 const ui=setupLocationReports({document:dom.window.document,get:async()=>{calls++;return {entries:[{userId:'one',recordedAt:0}],policy:{enabled:true,retentionDays:30}};},request:async()=>{}});
 ui.start({role:'admin'});assert.equal(calls,0);ui.start({role:'super_admin'});await new Promise(setImmediate);
 assert.equal(dom.window.document.querySelector('tbody tr').lastElementChild.textContent,'Not provided');ui.stop();dom.window.close();
});
