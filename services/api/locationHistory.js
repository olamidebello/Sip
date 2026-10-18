import {randomUUID} from 'node:crypto';
export async function migrateLocationHistory(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS user_location_history (
 id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
 latitude DOUBLE NOT NULL, longitude DOUBLE NOT NULL, accuracy_meters DOUBLE NOT NULL,
 recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX location_owner(tenant_id,user_id,recorded_at),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
}
export function validateLocation(input){
 if(!input||input.consent!==true||!Number.isFinite(input.latitude)||Math.abs(input.latitude)>90||
 !Number.isFinite(input.longitude)||Math.abs(input.longitude)>180||!Number.isFinite(input.accuracyMeters)||input.accuracyMeters<0||input.accuracyMeters>100000)
 throw Error('A valid location and explicit consent are required');
 return [input.latitude,input.longitude,input.accuracyMeters];
}
export async function handleLocationHistory({req,res,user,pool,send,readJson}){
 const owner=[user.tenant_id,user.id];
 if(req.method==='GET'){
 const result=await pool.query('SELECT id,latitude,longitude,accuracy_meters AS accuracyMeters,recorded_at AS recordedAt FROM user_location_history WHERE tenant_id=$1 AND user_id=$2 ORDER BY recorded_at DESC,id DESC LIMIT 100',owner);
 return send(res,200,{entries:result.rows});
 }
 if(req.method==='DELETE'){
 await pool.query('DELETE FROM user_location_history WHERE tenant_id=$1 AND user_id=$2',owner);
 return send(res,200,{status:'cleared'});
 }
 if(req.method!=='POST')return send(res,405,{error:'Method unavailable'});
 let coords;try{coords=validateLocation(await readJson(req));}catch(error){return send(res,400,{error:error.message});}
 const db=await pool.connect();try{
 await db.query('BEGIN');
 // Serialize saves per account and cap retained rows without trusting a submitted owner ID.
 await db.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[user.id,user.tenant_id]);
 const previous=await db.query('SELECT id FROM user_location_history WHERE tenant_id=$1 AND user_id=$2 ORDER BY recorded_at DESC,id DESC',owner);
 for(const row of previous.rows.slice(99))await db.query('DELETE FROM user_location_history WHERE id=$1 AND tenant_id=$2 AND user_id=$3',[row.id,...owner]);
 await db.query('DELETE FROM user_location_history WHERE tenant_id=$1 AND user_id=$2 AND recorded_at < UTC_TIMESTAMP() - INTERVAL 30 DAY',owner);
 const id=randomUUID();await db.query('INSERT INTO user_location_history(id,tenant_id,user_id,latitude,longitude,accuracy_meters) VALUES($1,$2,$3,$4,$5,$6)',[id,...owner,...coords]);
 await db.query('COMMIT');return send(res,201,{id});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
