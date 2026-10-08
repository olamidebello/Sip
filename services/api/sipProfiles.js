import { randomUUID } from 'node:crypto';

const actions=['view','add','edit','delete'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const sipProfileDefaults={view:true,add:false,edit:false,delete:false};
const parse=value=>typeof value==='string'?JSON.parse(value):value||{};
export function validateSipPolicy(value,full=false){
  return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>actions.includes(key)&&typeof value[key]==='boolean')&&(!full||actions.every(key=>key in value));
}
export function resolveSipPolicy(tenant,groups,user){
  const result={...sipProfileDefaults,...tenant};
  for(const group of groups) for(const action of actions) if(group[action]===true) result[action]=true;
  return {...result,...user};
}
export async function sipProfilePermissions(pool,user){
  if(user.role==='super_admin') return {view:true,add:true,edit:true,delete:true};
  const [tenant,groups,override]=await Promise.all([
    pool.query('SELECT permissions FROM sip_profile_tenant_permissions WHERE tenant_id=$1',[user.tenant_id]),
    pool.query('SELECT p.permissions FROM sip_profile_group_permissions p JOIN user_groups g ON g.id=p.group_id AND g.tenant_id=p.tenant_id JOIN user_group_members m ON m.group_id=g.id WHERE m.user_id=$1 AND p.tenant_id=$2',[user.id,user.tenant_id]),
    pool.query('SELECT permissions FROM sip_profile_user_permissions WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])
  ]);
  return resolveSipPolicy(parse(tenant.rows[0]?.permissions),groups.rows.map(row=>parse(row.permissions)),parse(override.rows[0]?.permissions));
}
export async function migrateSipProfiles(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS sip_profile_tenant_permissions (
    tenant_id CHAR(36) PRIMARY KEY, permissions JSON NOT NULL,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sip_profile_group_permissions (
    group_id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, permissions JSON NOT NULL,
    FOREIGN KEY(group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sip_profile_user_permissions (
    user_id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, permissions JSON NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sip_profiles (
    id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, owner_id CHAR(36) NOT NULL,
    label VARCHAR(100) NOT NULL, username VARCHAR(128) NOT NULL, domain VARCHAR(255) NOT NULL,
    wss_url VARCHAR(500) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX sip_profile_owner(tenant_id,owner_id)
  ) ENGINE=InnoDB`);
}
function validProfile(data){return data&&typeof data.label==='string'&&data.label.trim().length>0&&data.label.length<=100&&
  typeof data.username==='string'&&data.username.trim().length>0&&data.username.length<=128&&
  typeof data.domain==='string'&&/^[a-z0-9.-]+$/i.test(data.domain)&&data.domain.length<=255&&
  typeof data.wssUrl==='string'&&/^wss:\/\/[^\s/@?#]+(?:\/[^\s]*)?$/.test(data.wssUrl)&&data.wssUrl.length<=500;}
const fields=row=>({id:row.id,ownerId:row.owner_id,label:row.label,username:row.username,domain:row.domain,wssUrl:row.wss_url});
export async function handleSipProfiles({req,res,path,user,pool,send,readJson,url}){
  const superAdmin=user.role==='super_admin';
  const policyRoute=path.startsWith('/api/admin/sip-profile-policy');
  if(policyRoute){
    if(!superAdmin) return send(res,403,{error:'Super administrator required'});
    const body=req.method==='GET'?null:await readJson(req);
    const tenantId=req.method==='GET'?url.searchParams.get('tenantId'):body?.tenantId;
    if(!uuid.test(tenantId||'')) return send(res,400,{error:'Valid tenant ID required'});
    const tenant=(await pool.query("SELECT id,name FROM tenants WHERE id=$1 AND status='active'",[tenantId])).rows[0];
    if(!tenant) return send(res,404,{error:'Active tenant unavailable'});
    if(req.method==='GET'&&path==='/api/admin/sip-profile-policy'){
      const [base,groups,users]=await Promise.all([
        pool.query('SELECT permissions FROM sip_profile_tenant_permissions WHERE tenant_id=$1',[tenantId]),
        pool.query('SELECT g.id,g.name,p.permissions FROM user_groups g LEFT JOIN sip_profile_group_permissions p ON p.group_id=g.id WHERE g.tenant_id=$1 ORDER BY g.name LIMIT 200',[tenantId]),
        pool.query('SELECT u.id,u.display_name AS name,u.email,p.permissions FROM users u LEFT JOIN sip_profile_user_permissions p ON p.user_id=u.id WHERE u.tenant_id=$1 ORDER BY u.created_at DESC LIMIT 200',[tenantId])
      ]);
      return send(res,200,{tenant,tenantPermissions:{...sipProfileDefaults,...parse(base.rows[0]?.permissions)},
        groups:groups.rows.map(row=>({...row,permissions:parse(row.permissions)})),users:users.rows.map(row=>({...row,permissions:parse(row.permissions)}))});
    }
    if(req.method==='PUT'){
      const match=/^\/api\/admin\/sip-profile-policy\/(tenant|group|user)(?:\/([0-9a-f-]{36}))?$/i.exec(path);
      if(!match||!validateSipPolicy(body.permissions,match[1]==='tenant')||
        (match[1]==='tenant'&&match[2])||(match[1]!=='tenant'&&!uuid.test(match[2]||'')))
        return send(res,400,{error:'Valid policy and subject required'});
      const [,scope,id]=match,permissions=JSON.stringify(body.permissions);
      if(scope==='tenant') await pool.query('INSERT INTO sip_profile_tenant_permissions(tenant_id,permissions) VALUES($1,$2) ON DUPLICATE KEY UPDATE permissions=VALUES(permissions)',[tenantId,permissions]);
      else {
        const table=scope==='group'?'user_groups':'users';
        if(!(await pool.query(`SELECT id FROM ${table} WHERE id=$1 AND tenant_id=$2`,[id,tenantId])).rowCount)
          return send(res,404,{error:'Subject unavailable in tenant'});
        const target=scope==='group'?'sip_profile_group_permissions':'sip_profile_user_permissions',column=scope==='group'?'group_id':'user_id';
        await pool.query(`INSERT INTO ${target}(${column},tenant_id,permissions) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE permissions=VALUES(permissions)`,[id,tenantId,permissions]);
      }
      return send(res,200,{permissions:body.permissions});
    }
    return send(res,405,{error:'Method unavailable'});
  }
  if(path==='/api/sip-profiles'||/^\/api\/sip-profiles\/[0-9a-f-]{36}$/i.test(path)){
    const permissions=await sipProfilePermissions(pool,user);
    const action=req.method==='GET'?'view':req.method==='POST'?'add':req.method==='PUT'?'edit':req.method==='DELETE'?'delete':null;
    if(!action) return send(res,405,{error:'Method unavailable'});
    if(!permissions[action]) return send(res,403,{error:`SIP profile ${action} permission required`});
    const id=path.split('/')[3],collection=path==='/api/sip-profiles';
    if(req.method==='GET'&&collection){
      const rows=await pool.query('SELECT id,owner_id,label,username,domain,wss_url FROM sip_profiles WHERE tenant_id=$1 AND owner_id=$2 ORDER BY created_at DESC LIMIT 100',[user.tenant_id,user.id]);
      return send(res,200,{permissions,profiles:rows.rows.map(fields)});
    }
    if(req.method==='POST'&&collection){
      const data=await readJson(req);
      if(!validProfile(data)) return send(res,400,{error:'Valid label, username, domain and secure WSS URL required'});
      const profileId=randomUUID();
      await pool.query('INSERT INTO sip_profiles(id,tenant_id,owner_id,label,username,domain,wss_url) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [profileId,user.tenant_id,user.id,data.label.trim(),data.username.trim(),data.domain,data.wssUrl]);
      return send(res,201,{id:profileId});
    }
    if(!collection&&id&&['PUT','DELETE'].includes(req.method)){
      if(req.method==='PUT'){
        const data=await readJson(req);
        if(!validProfile(data)) return send(res,400,{error:'Valid profile fields required'});
        const updated=await pool.query('UPDATE sip_profiles SET label=$1,username=$2,domain=$3,wss_url=$4 WHERE id=$5 AND tenant_id=$6 AND owner_id=$7',
          [data.label.trim(),data.username.trim(),data.domain,data.wssUrl,id,user.tenant_id,user.id]);
        return send(res,updated.rowCount?200:404,updated.rowCount?{id}:{error:'Profile unavailable'});
      }
      const deleted=await pool.query('DELETE FROM sip_profiles WHERE id=$1 AND tenant_id=$2 AND owner_id=$3',[id,user.tenant_id,user.id]);
      return send(res,deleted.rowCount?200:404,deleted.rowCount?{deleted:true}:{error:'Profile unavailable'});
    }
    return send(res,405,{error:'Method unavailable'});
  }
  return send(res,404,{error:'SIP profile route unavailable'});
}
