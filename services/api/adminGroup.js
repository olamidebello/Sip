import {randomUUID} from 'node:crypto';
export const adminCapabilities=Object.freeze(['users.read','reports.read','cdr.read','plans.read','plans.write','support.manage']);
export const defaultAdminPermissions=Object.freeze(['users.read','reports.read','cdr.read','plans.read','support.manage']);
export async function migrateAdminGroup(db){
 await db.query(`CREATE TABLE IF NOT EXISTS system_admin_group (
 tenant_id CHAR(36) PRIMARY KEY,enabled BOOLEAN NOT NULL DEFAULT TRUE,
 permissions JSON NOT NULL,revision INT NOT NULL DEFAULT 1,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE) ENGINE=InnoDB`);
 await db.query(`INSERT IGNORE INTO system_admin_group(tenant_id,permissions) SELECT id,$1 FROM tenants`,[JSON.stringify(defaultAdminPermissions)]);
}
export async function adminGroupPolicy(db,tenant){
 const row=(await db.query('SELECT enabled,permissions,revision FROM system_admin_group WHERE tenant_id=$1',[tenant])).rows[0];
 if(!row)return {enabled:false,permissions:[],revision:0};
 let permissions;try{permissions=typeof row.permissions==='string'?JSON.parse(row.permissions):row.permissions;}catch{permissions=[];}
 return {enabled:!!Number(row.enabled),permissions:Array.isArray(permissions)?permissions.filter(p=>adminCapabilities.includes(p)):[],revision:Number(row.revision)};
}
export function adminRouteCapability(path,method){
 if(path==='/api/admin/users'&&method==='GET')return 'users.read';
 if(['/api/admin/reports','/api/admin/reports.csv'].includes(path)&&method==='GET')return 'reports.read';
 if(path==='/api/admin/cdr'&&method==='GET')return 'cdr.read';
 if(path==='/api/admin/plans'&&method==='GET')return 'plans.read';
 if((path==='/api/admin/plans'&&method==='POST')||(/^\/api\/admin\/plans\/[a-f0-9-]{36}$/i.test(path)&&method==='PUT'))return 'plans.write';
 return null;
}
export async function adminRouteAllowed(db,user,path,method){
 if(user?.role==='super_admin')return true;
 if(user?.role!=='admin')return false;
 const capability=adminRouteCapability(path,method);
 if(!capability)return false;
 const p=await adminGroupPolicy(db,user.tenant_id);return p.enabled&&p.permissions.includes(capability);
}
export async function scopedAdminUser(db,user,path){
 if(user.role!=='admin'||path.startsWith('/api/admin/'))return user;
 // Personal routes run with ordinary-user authority, except explicitly delegated support.
 if(path.startsWith('/api/support/')){const p=await adminGroupPolicy(db,user.tenant_id);if(p.enabled&&p.permissions.includes('support.manage'))return user;}
 return {...user,role:'user'};
}
export async function changeAdminRole(pool,{actor,targetId,email,tenantId,role}){
 if(actor&&actor.role!=='super_admin')throw Object.assign(Error('Super administrator required'),{httpStatus:403});
 if(!['user','admin'].includes(role))throw Object.assign(Error('Role must be user or admin'),{httpStatus:400});
 const db=await pool.connect();let locked=false;
 try{
  locked=Number((await db.query("SELECT GET_LOCK('system-admin-role',5) AS acquired")).rows[0]?.acquired)===1;
  if(!locked)throw Object.assign(Error('Another role change is in progress'),{httpStatus:409});
  await db.query('START TRANSACTION');
  const selector=email?'LOWER(email)=$1':'id=$1';
  const args=[email?email.trim().toLowerCase():targetId];if(tenantId)args.push(tenantId);
  const target=(await db.query(`SELECT id,tenant_id,role,status FROM users WHERE ${selector}${tenantId?' AND tenant_id=$2':''} FOR UPDATE`,args)).rows[0];
  if(!target)throw Object.assign(Error('Account unavailable'),{httpStatus:404});
  if(actor?.id===target.id)throw Object.assign(Error('Use another super administrator to change your role'),{httpStatus:409});
  const owner=await db.query('SELECT tenant_id FROM system_admin_group WHERE tenant_id=$1',[target.tenant_id]);
  if(!owner.rows.length)throw Object.assign(Error('Deploy Admin group schema before changing roles'),{httpStatus:409});
  if(target.role==='super_admin'){
   const remaining=Number((await db.query("SELECT COUNT(*) AS n FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.role='super_admin' AND u.status='active' AND t.status='active' AND u.id<>$1",[target.id])).rows[0]?.n||0);
   if(remaining<1)throw Object.assign(Error('Cannot remove the last active super administrator'),{httpStatus:409});
  }
  await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,target.id]);
  await db.query('DELETE FROM sessions WHERE user_id=$1',[target.id]);
  await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,'system_admin_role_changed')",[randomUUID(),target.tenant_id,actor?.id||'00000000-0000-4000-8000-000000000000',target.id]);
  await db.query('COMMIT');return {id:target.id,role,previousRole:target.role};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{if(locked)await db.query("SELECT RELEASE_LOCK('system-admin-role')");db.release();}
}
export async function handleAdminGroup({req,res,path,user,pool,send,readJson,meetingSignaling}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method==='GET'&&path==='/api/admin/system-admin-group'){
  await pool.query('INSERT IGNORE INTO system_admin_group(tenant_id,permissions) VALUES($1,$2)',[user.tenant_id,JSON.stringify(defaultAdminPermissions)]);
  const members=await pool.query("SELECT id,display_name AS name,email,role,status FROM users WHERE tenant_id=$1 ORDER BY email LIMIT 500",[user.tenant_id]);
  return send(res,200,{name:'Admin',capabilities:adminCapabilities,policy:await adminGroupPolicy(pool,user.tenant_id),users:members.rows});
 }
 try{
  if(req.method==='PUT'&&path==='/api/admin/system-admin-group'){
   const b=await readJson(req);
   if(typeof b.enabled!=='boolean'||!Number.isInteger(b.revision)||!Array.isArray(b.permissions)||b.permissions.some(p=>!adminCapabilities.includes(p)))return send(res,400,{error:'Valid group state, permissions and revision required'});
   const db=await pool.connect();try{
    await db.query('START TRANSACTION');
    const changed=await db.query('UPDATE system_admin_group SET enabled=$1,permissions=$2,revision=revision+1 WHERE tenant_id=$3 AND revision=$4',[b.enabled,JSON.stringify([...new Set(b.permissions)]),user.tenant_id,b.revision]);
    if(!changed.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Group changed; reload before saving'});}
    await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,'system_admin_policy_changed')",[randomUUID(),user.tenant_id,user.id]);
    await db.query('COMMIT');return send(res,200,{saved:true});
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  const match=/^\/api\/admin\/system-admin-group\/users\/([a-f0-9-]{36})$/i.exec(path);
  if(match&&req.method==='PUT'){
   const {role}=await readJson(req);const result=await changeAdminRole(pool,{actor:user,targetId:match[1],tenantId:user.tenant_id,role});
   meetingSignaling?.closeUser?.(result.id);return send(res,200,result);
  }
  return send(res,405,{error:'Unsupported Admin group action'});
 }catch(e){if(e.httpStatus)return send(res,e.httpStatus,{error:e.message});throw e;}
}
