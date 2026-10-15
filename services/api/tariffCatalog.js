import {randomUUID} from 'node:crypto';
// Independent application catalogs. These records do not alter live switch tariffs.
const kinds=new Set(['call-types','rate-groups']);
export function validateTariffEntry(body){
 if(!body||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100||typeof body.description!=='string'||body.description.length>1000||typeof body.enabled!=='boolean')throw Error('Name (1–100 characters), description (up to 1000 characters) and enabled state required');
 return {name:body.name.trim(),description:body.description.trim(),enabled:body.enabled};
}
export async function migrateTariffCatalog(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS telecom_tariff_catalog(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,kind VARCHAR(20) NOT NULL,name VARCHAR(100) NOT NULL,description VARCHAR(1000) NOT NULL,enabled BOOLEAN NOT NULL,revision INT UNSIGNED NOT NULL DEFAULT 1,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),UNIQUE KEY tariff_name(tenant_id,kind,name),KEY tariff_kind(tenant_id,kind),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
}
export async function handleTariffCatalog({req,res,path,user,pool,send,readJson}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const suffix=path.slice('/api/admin/tariff-catalog/'.length),parts=suffix.split('/'),[kind,id]=parts;
 if(!kinds.has(kind)||parts.length>2||(id&&!/^[a-f0-9-]{36}$/i.test(id)))return send(res,404,{error:'Unknown tariff resource'});
 if(req.method==='GET'&&!id){
  const params=new URL(req.url||path,'http://localhost').searchParams;
  const offset=Number(params.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return send(res,400,{error:'Invalid offset'});
  const result=await pool.query('SELECT id,name,description,enabled,revision,updated_at FROM telecom_tariff_catalog WHERE tenant_id=$1 AND kind=$2 ORDER BY name,id LIMIT 101 OFFSET $3',[user.tenant_id,kind,offset]);
  return send(res,200,{rows:result.rows.slice(0,100).map(r=>({...r,enabled:!!Number(r.enabled),revision:Number(r.revision)})),nextOffset:result.rows.length>100?offset+100:null,scope:'Application catalog only; live switch rating and native Olamide SIP synchronization are not configured.'});
 }
 if(!((req.method==='POST'&&!id)||(req.method==='PUT'&&id)))return send(res,405,{error:'Use GET, POST or PUT on the matching resource'});
 let body,entry;try{body=await readJson(req);entry=validateTariffEntry(body);if(id&&(!Number.isSafeInteger(body.revision)||body.revision<1))throw Error('Current revision required');}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  if(id){
   const result=await db.query('UPDATE telecom_tariff_catalog SET name=$1,description=$2,enabled=$3,revision=revision+1,updated_by=$4 WHERE id=$5 AND tenant_id=$6 AND kind=$7 AND revision=$8',[entry.name,entry.description,entry.enabled,user.id,id,user.tenant_id,kind,body.revision]);
   if(!result.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Record unavailable or changed; refresh before saving'});}
  }else await db.query('INSERT INTO telecom_tariff_catalog(id,tenant_id,kind,name,description,enabled,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),user.tenant_id,kind,entry.name,entry.description,entry.enabled,user.id]);
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,$4)',[randomUUID(),user.tenant_id,user.id,'tariff_catalog_'+kind+'_'+(id?'updated':'created')]);
  await db.query('COMMIT');return send(res,id?200:201,{saved:true});
 }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'A record with that name already exists'});throw e;}finally{db.release();}
}
