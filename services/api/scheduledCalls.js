import {randomUUID} from 'node:crypto';
export function validateScheduledCall(value,now=Date.now()){
 const title=value?.title?.trim(),address=value?.address?.trim(),time=Date.parse(value?.startsAt);
 if(typeof title!=='string'||!title||title.length>100||typeof address!=='string'||address.length>255||!/^sip:[^\s@]+@[^\s@]+$/i.test(address)||!Number.isFinite(time)||time<=now||time>now+366*86400000)throw new Error('A title, SIP address and future time within one year are required');
 return {title,address,startsAt:new Date(time).toISOString()};
}
export async function migrateScheduledCalls(pool){await pool.query(`CREATE TABLE IF NOT EXISTS scheduled_calls (
 id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,title VARCHAR(100) NOT NULL,address VARCHAR(255) NOT NULL,starts_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,INDEX scheduled_calls_owner(user_id,tenant_id,starts_at)) ENGINE=InnoDB`);}
export async function handleScheduledCalls({req,res,path,user,pool,send,readJson}){
 if(path==='/api/softphone/scheduled'&&req.method==='GET'){const data=await pool.query('SELECT id,title,address,starts_at AS startsAt FROM scheduled_calls WHERE user_id=$1 AND tenant_id=$2 ORDER BY starts_at,id LIMIT 100',[user.id,user.tenant_id]);return send(res,200,{calls:data.rows});}
 if(path==='/api/softphone/scheduled'&&req.method==='POST'){
 let value;try{value=validateScheduledCall(await readJson(req));}catch(error){return send(res,400,{error:error.message});}
 const db=await pool.connect();try{await db.query('BEGIN');await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);const count=await db.query('SELECT COUNT(*) AS count FROM scheduled_calls WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id]);if(Number(count.rows[0].count)>=100){await db.query('ROLLBACK');return send(res,409,{error:'Remove a scheduled call before adding another (maximum 100)'});}const id=randomUUID();await db.query('INSERT INTO scheduled_calls(id,user_id,tenant_id,title,address,starts_at) VALUES($1,$2,$3,$4,$5,$6)',[id,user.id,user.tenant_id,value.title,value.address,value.startsAt.replace('T',' ').replace('Z','')]);await db.query('COMMIT');return send(res,201,{id,...value});}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
 const match=/^\/api\/softphone\/scheduled\/([0-9a-f-]{36})$/i.exec(path);
 if(match&&req.method==='DELETE'){const result=await pool.query('DELETE FROM scheduled_calls WHERE id=$1 AND user_id=$2 AND tenant_id=$3',[match[1],user.id,user.tenant_id]);return send(res,result.rowCount?200:404,result.rowCount?{status:'removed'}:{error:'Scheduled call unavailable'});}
 return send(res,404,{error:'Scheduled call route unavailable'});
}
