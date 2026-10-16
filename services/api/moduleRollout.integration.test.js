import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createDatabase} from './db.js';
import {migrate} from './migrate.js';
import {handleCdrArchives,processCdrArchive} from './cdrArchive.js';
import {handleMarketplaceControl} from './marketplaceControl.js';
import {handleProductStore} from './productStore.js';
test('MySQL product creation, marketplace dashboard and bounded archive download use real tenant data',{skip:!process.env.TEST_MYSQL_URL},async()=>{
 const pool=createDatabase(process.env.TEST_MYSQL_URL),tenant=randomUUID(),other=randomUUID(),actor=randomUUID(),record=randomUUID();
 const user={id:actor,tenant_id:tenant,role:'super_admin',features:{billing:true}},send=(_r,status,body)=>({status,body});
 const call=(fn,method,path,body,who=user,res={})=>fn({req:{method},res,path,user:who,pool,send,readJson:async()=>body});
 try{
  await migrate(pool);
  for(const id of [tenant,other])await pool.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)',[id,'Module test',id]);
  await pool.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status) VALUES($1,$2,'Module test',$3,'test','test','super_admin','active')",[actor,tenant,actor+'@example.test']);
  const product={sku:'TEST',name:'Test plan',category:'SIP',description:'Test',terms:'Reviewed provisioning and cancellation terms.',billing:'monthly',sellingCents:995,resellerCents:695,setupCents:0,status:'draft'};
  assert.equal((await call(handleProductStore,'POST','/api/admin/store/products',product)).status,201);
  assert.equal((await call(handleProductStore,'POST','/api/admin/store/products',product)).status,409);
  const overview=await call(handleMarketplaceControl,'GET','/api/admin/marketplace/overview');assert.equal(Number(overview.body.products[0].count),1);
  assert.equal((await call(handleMarketplaceControl,'GET','/api/admin/marketplace/overview',null,{...user,tenant_id:other})).body.products.length,0);
  await pool.query("INSERT INTO cdr_records(id,tenant_id,source,leg_id,payload_hash,direction,caller_e164,callee_e164,disposition,duration_seconds,billable_seconds,started_at,received_at) VALUES($1,$2,'test','leg',$3,'outbound','+15551234567','+15559876543','answered',60,60,'2026-10-01 12:00:00','2026-10-01 12:01:00')",[record,tenant,'a'.repeat(64)]);
  const job=await call(handleCdrArchives,'POST','/api/admin/telecom/archives',{from:'2026-10-01',to:'2026-10-01'});assert.equal(job.status,202);
  await processCdrArchive(pool);
  const state=(await pool.query('SELECT status,row_count FROM cdr_archives WHERE id=$1',[job.body.id])).rows[0];assert.equal(state.status,'ready');assert.equal(state.row_count,1);
  let downloaded;const res={writeHead(status,headers){assert.equal(status,200);assert.equal(headers['Content-Type'],'application/gzip');},end(data){downloaded=data;}};
  await call(handleCdrArchives,'GET','/api/admin/telecom/archives/'+job.body.id+'/download',null,user,res);assert.match(gunzipSync(downloaded).toString(),/15551234567/);
  assert.equal((await call(handleCdrArchives,'GET','/api/admin/telecom/archives/'+job.body.id+'/download',null,{...user,tenant_id:other})).status,404);
  assert.equal((await call(handleCdrArchives,'DELETE','/api/admin/telecom/archives/'+job.body.id)).status,200);
  assert.equal((await pool.query('SELECT id FROM cdr_records WHERE id=$1',[record])).rowCount,1);
 }finally{
  for(const table of ['cdr_archives','cdr_archive_schedules','cdr_records','store_products','security_events'])await pool.query('DELETE FROM '+table+' WHERE tenant_id=$1',[tenant]);
  await pool.query('DELETE FROM users WHERE id=$1',[actor]);await pool.query('DELETE FROM tenants WHERE id IN ($1,$2)',[tenant,other]);await pool.end();
 }
});
