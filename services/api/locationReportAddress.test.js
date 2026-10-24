import test from 'node:test';
import assert from 'node:assert/strict';
import {profileAddress} from './locationReportAddress.js';
import {handleLocationReports} from './locationReports.js';
test('profile address handles full, partial and missing data without inventing values',()=>{
 assert.equal(profileAddress({address1:' 1 Main St ',address2:'Suite 2',city:'Dallas',region:'TX',postalCode:'75001',country:'US'}),'1 Main St, Suite 2, Dallas, TX, 75001, US');
 assert.equal(profileAddress({city:'Lagos',country:'NG'}),'Lagos, NG');assert.equal(profileAddress({address1:null}), '');
});
test('report joins profile address through the tenant-bound user and retains coordinates',async()=>{
 const calls=[],row={userId:'owner',name:'Person',latitude:6.5,longitude:3.4,accuracyMeters:25,recordedAt:'2026-10-24T12:00:00Z',address1:'1 Main St',city:'Lagos',country:'NG'};
 const result=await handleLocationReports({req:{method:'GET',url:'/api/admin/location-reports'},user:{role:'super_admin',tenant_id:'selected-tenant',id:'actor'},pool:{query:async(sql,args)=>{calls.push([sql,args]);return {rows:sql.startsWith('SELECT h.user_id')?[row]:[]};}},send:(_r,status,body)=>({status,body})});
 assert.equal(result.status,200);assert.equal(result.body.entries[0].profileAddress,'1 Main St, Lagos, NG');assert.equal(result.body.entries[0].latitude,6.5);
 const query=calls.find(([sql])=>sql.startsWith('SELECT h.user_id'));assert.match(query[0],/LEFT JOIN user_profiles p ON p.user_id=u.id/);assert.match(query[0],/u.tenant_id=h.tenant_id/);assert.deepEqual(query[1],['selected-tenant']);
});
test('ordinary Admin cannot retrieve addresses through the location report',async()=>{
 const result=await handleLocationReports({req:{method:'GET',url:'/api/admin/location-reports'},user:{role:'admin'},pool:{query(){throw Error('No database access');}},send:(_r,status)=>status});assert.equal(result,403);
});
