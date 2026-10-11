import {randomUUID} from 'node:crypto';
import {hashPassword} from './security.js';
import {defaultTenantId} from './tenancy.js';
import {pathToFileURL} from 'node:url';
export async function bootstrapProductionAdmin(pool,input){
 if(typeof input.email!=='string'||input.email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)||typeof input.password!=='string'||input.password.length<32||input.password.length>1024)throw Error('Private administrator identity required');
 const db=await pool.connect();let locked=false;
 try{
  const lock=await db.query("SELECT GET_LOCK('olamide_initial_admin',30) AS acquired");if(Number(lock.rows[0]?.acquired)!==1)throw Error('Administrator bootstrap locked');locked=true;
  const admins=await db.query("SELECT u.id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.role='super_admin' AND u.status='active' AND t.status='active' LIMIT 1");if(admins.rows.length)return {created:false};
  const users=await db.query('SELECT id FROM users LIMIT 1');if(users.rows.length)throw Error('Existing deployment has no active super administrator; manual account review required');
  const {salt,hash}=await hashPassword(input.password);
  await db.query("INSERT INTO users(id,tenant_id,display_name,email,password_salt,password_hash,role,status,must_change_password) VALUES($1,$2,'Initial administrator',$3,$4,$5,'super_admin','active',TRUE)",[randomUUID(),defaultTenantId,input.email.toLowerCase(),salt,hash]);
  return {created:true};
 }finally{if(locked)await db.query("SELECT RELEASE_LOCK('olamide_initial_admin')");db.release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let text='';for await(const part of process.stdin){text+=part;if(text.length>8192)throw Error('Administrator input too large');}
 const {createDatabase}=await import('./db.js');const pool=createDatabase(process.env.MYSQL_URL);try{const result=await bootstrapProductionAdmin(pool,JSON.parse(text));console.log(result.created?'Initial administrator created; private credential file remains on server.':'Existing administrator preserved.');}finally{await pool.end();}
}
