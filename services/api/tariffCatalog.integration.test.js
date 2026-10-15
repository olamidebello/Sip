import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createDatabase} from './db.js';import {migrate} from './migrate.js';import {handleTariffCatalog} from './tariffCatalog.js';
test('MySQL tariff catalogs persist, reject stale writes and isolate tenants',{skip:!process.env.TEST_MYSQL_URL},async()=>{
 const pool=createDatabase(process.env.TEST_MYSQL_URL),tenant=randomUUID(),other=randomUUID(),actor=randomUUID();
 const send=(_r,status,body)=>({status,body}),user={id:actor,tenant_id:tenant,role:'super_admin'};
 const call=(method,kind,body,who=user)=>handleTariffCatalog({req:{method},path:'/api/admin/tariff-catalog/'+kind,user:who,pool,send,readJson:async()=>body});
 try{
  await migrate(pool);
  for(const id of [tenant,other])await pool.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)',[id,'Tariff test',id]);
  await pool.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status) VALUES($1,$2,'Tariff test',$3,'test','test','super_admin','active')",[actor,tenant,actor+'@example.test']);
  for(const kind of ['call-types','rate-groups']){
   const body={name:'Domestic',description:'Test',enabled:true};assert.equal((await call('POST',kind,body)).status,201);
   assert.equal((await call('POST',kind,body)).status,409);
   const row=(await call('GET',kind)).body.rows[0];assert.equal(row.enabled,true);assert.equal(row.revision,1);
   const edits=await Promise.all([1,2].map(i=>call('PUT',kind+'/'+row.id,{...body,description:'Edit '+i,revision:1})));assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]);
   assert.equal((await call('GET',kind,null,{...user,tenant_id:other})).body.rows.length,0);
   assert.equal((await call('PUT',kind+'/'+row.id,{...body,revision:2},{...user,tenant_id:other})).status,409);
  }
  const audit=(await pool.query("SELECT COUNT(*) AS n FROM security_events WHERE tenant_id=$1 AND action LIKE 'tariff_catalog_%'",[tenant])).rows[0];assert.equal(Number(audit.n),4);
 }finally{
  await pool.query('DELETE FROM telecom_tariff_catalog WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM security_events WHERE tenant_id=$1',[tenant]);await pool.query('DELETE FROM users WHERE id=$1',[actor]);await pool.query('DELETE FROM tenants WHERE id IN ($1,$2)',[tenant,other]);await pool.end();
 }
});
