import {randomUUID} from 'node:crypto';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const name=/^[a-z][a-z0-9-]{1,39}$/;
const short=/^[\w .:/-]{0,120}$/;
const levels={none:0,view:1,manage:2,deploy:3};
const kinds=['router','switch','firewall','load_balancer','server'];
const ipv4=value=>{
  const parts=String(value||'').split('.');
  return parts.length===4&&parts.every(p=>/^\d{1,3}$/.test(p)&&Number(p)<=255)&&
    ![0,127,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255].includes(Number(parts[0]))&&
    !(parts[0]==='169'&&parts[1]==='254')&&value!=='100.100.100.200';
};
export function validConfig(config){
  if(!config||typeof config!=='object'||Array.isArray(config))return false;
  if(Object.keys(config).some(k=>!['hostname','description','vlans','interfaces','routes'].includes(k)))return false;
  if(config.hostname!==undefined&&!name.test(config.hostname))return false;
  if(config.description!==undefined&&(typeof config.description!=='string'||!short.test(config.description)))return false;
  for(const [key,max,fields] of [['vlans',64,['id','name']],['interfaces',64,['name','description','vlan','enabled']],['routes',64,['destination','gateway']]]){
    const rows=config[key]??[];
    if(!Array.isArray(rows)||rows.length>max)return false;
    for(const row of rows){
      if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!fields.includes(k)))return false;
      if(key==='vlans'&&(!Number.isInteger(row.id)||row.id<1||row.id>4094||!name.test(row.name||'')))return false;
      if(key==='interfaces'&&(!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,39}$/.test(row.name||'')||
        (row.description!==undefined&&!short.test(row.description))||
        (row.vlan!==undefined&&(!Number.isInteger(row.vlan)||row.vlan<1||row.vlan>4094))||
        (row.enabled!==undefined&&typeof row.enabled!=='boolean')))return false;
      if(key==='routes'&&(!/^\d{1,3}(?:\.\d{1,3}){3}\/(?:\d|[12]\d|3[0-2])$/.test(row.destination||'')||
        !ipv4(row.destination.split('/')[0])||!ipv4(row.gateway)))return false;
    }
  }
  return JSON.stringify(config).length<=12000;
}
export function validDevice(b){
  return !!b&&name.test(b.name||'')&&kinds.includes(b.kind)&&ipv4(b.host)&&
    Number.isInteger(b.port)&&b.port>=1&&b.port<=65535&&typeof b.site==='string'&&
    b.site.length>=1&&b.site.length<=60&&short.test(b.site)&&typeof b.enabled==='boolean'&&
    (!b.nodeId||uuid.test(b.nodeId))&&validConfig(b.config);
}
export async function migrateFleetNetwork(pool){
  const columns=await pool.query("SELECT column_name AS column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='deployment_nodes' AND column_name IN ('sort_order','deleted_at')");
  const existing=new Set(columns.rows.map(r=>r.column_name));
  if(!existing.has('sort_order'))await pool.query('ALTER TABLE deployment_nodes ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0');
  if(!existing.has('deleted_at'))await pool.query('ALTER TABLE deployment_nodes ADD COLUMN deleted_at DATETIME(3) NULL');
  await pool.query(`CREATE TABLE IF NOT EXISTS fleet_access_grants (
    id CHAR(36) PRIMARY KEY,user_id CHAR(36) NULL,group_id CHAR(36) NULL,
    access_level VARCHAR(12) NOT NULL,created_by CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT one_fleet_principal CHECK ((user_id IS NULL) <> (group_id IS NULL)),
    FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(group_id) REFERENCES user_groups(id),
    FOREIGN KEY(created_by) REFERENCES users(id),UNIQUE KEY grant_user(user_id),UNIQUE KEY grant_group(group_id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fleet_devices (
    id CHAR(36) PRIMARY KEY,name VARCHAR(40) NOT NULL UNIQUE,kind VARCHAR(20) NOT NULL,
    host VARCHAR(45) NOT NULL,port SMALLINT UNSIGNED NOT NULL,site VARCHAR(60) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,node_id CHAR(36) NULL,sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    config_version INT UNSIGNED NOT NULL DEFAULT 1,desired_config JSON NOT NULL,
    created_by CHAR(36) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    deleted_at DATETIME(3) NULL,
    FOREIGN KEY(node_id) REFERENCES deployment_nodes(id),FOREIGN KEY(created_by) REFERENCES users(id),
    INDEX fleet_device_order(sort_order,name)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fleet_config_revisions (
    id CHAR(36) PRIMARY KEY,device_id CHAR(36) NOT NULL,version INT UNSIGNED NOT NULL,
    configuration JSON NOT NULL,actor_id CHAR(36) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(device_id) REFERENCES fleet_devices(id),FOREIGN KEY(actor_id) REFERENCES users(id),
    UNIQUE KEY device_version(device_id,version)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS fleet_audit (
    id CHAR(36) PRIMARY KEY,device_id CHAR(36) NULL,actor_id CHAR(36) NOT NULL,
    action VARCHAR(32) NOT NULL,detail VARCHAR(250) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(device_id) REFERENCES fleet_devices(id),FOREIGN KEY(actor_id) REFERENCES users(id),
    INDEX fleet_audit_time(created_at)
  ) ENGINE=InnoDB`);
}
export async function fleetLevel(pool,user){
  if(user.role==='super_admin')return 'deploy';
  const rows=await pool.query(`SELECT access_level FROM fleet_access_grants WHERE user_id=$1 OR group_id IN (
    SELECT m.group_id FROM user_group_members m JOIN user_groups g ON g.id=m.group_id
    WHERE m.user_id=$1 AND g.tenant_id=$2)`,[user.id,user.tenant_id]);
  return rows.rows.reduce((best,row)=>levels[row.access_level]>levels[best]?row.access_level:best,'none');
}
async function audit(db,user,action,detail,deviceId=null){
  await db.query('INSERT INTO fleet_audit(id,device_id,actor_id,action,detail) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(),deviceId,user.id,action,detail.slice(0,250)]);
}
async function linkedNode(db,id){
  if(!id)return true;
  const found=await db.query("SELECT id FROM deployment_nodes WHERE id=$1 AND role='switch' AND deleted_at IS NULL",[id]);
  return !!found.rowCount;
}
export async function handleFleetNetwork({req,res,path,user,pool,send,readJson,level}){
  const allowed=needed=>levels[level]>=levels[needed];
  if(path==='/api/admin/servers/access'&&req.method==='GET'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const [users,groups,grants]=await Promise.all([
      pool.query("SELECT id,display_name,email,role FROM users WHERE tenant_id=$1 AND status='active' ORDER BY display_name LIMIT 200",[user.tenant_id]),
      pool.query('SELECT id,name FROM user_groups WHERE tenant_id=$1 ORDER BY name LIMIT 200',[user.tenant_id]),
      pool.query('SELECT id,user_id,group_id,access_level FROM fleet_access_grants ORDER BY created_at DESC LIMIT 300')]);
    return send(res,200,{users:users.rows,groups:groups.rows,grants:grants.rows});
  }
  if(path==='/api/admin/servers/access'&&req.method==='POST'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const b=await readJson(req);
    if(!['view','manage','deploy'].includes(b.level)||!['user','group'].includes(b.type)||!uuid.test(b.principalId||''))return send(res,400,{error:'Valid principal and access level required'});
    const table=b.type==='user'?'users':'user_groups';
    const found=await pool.query(`SELECT id FROM ${table} WHERE id=$1 AND tenant_id=$2`,[b.principalId,user.tenant_id]);
    if(!found.rowCount)return send(res,404,{error:'Principal unavailable in selected tenant'});
    const db=await pool.connect();try{
      await db.query('START TRANSACTION');
      const column=b.type==='user'?'user_id':'group_id';
      await db.query(`INSERT INTO fleet_access_grants(id,${column},access_level,created_by) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE access_level=$3`,[randomUUID(),b.principalId,b.level,user.id]);
      await audit(db,user,'access_granted',`${b.type} ${b.principalId}: ${b.level}`);
      await db.query('COMMIT');return send(res,200,{saved:true});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  const grant=/^\/api\/admin\/servers\/access\/([0-9a-f-]{36})$/.exec(path);
  if(grant&&uuid.test(grant[1])&&req.method==='DELETE'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const db=await pool.connect();try{
      await db.query('START TRANSACTION');
      const removed=await db.query('DELETE FROM fleet_access_grants WHERE id=$1',[grant[1]]);
      if(removed.rowCount)await audit(db,user,'access_revoked',grant[1]);
      await db.query('COMMIT');return send(res,removed.rowCount?200:404,removed.rowCount?{deleted:true}:{error:'Grant unavailable'});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  if(path==='/api/admin/servers/devices'&&req.method==='GET'){
    if(!allowed('view'))return send(res,403,{error:'Fleet view access required'});
    const [devices,events]=await Promise.all([
      pool.query('SELECT id,name,kind,host,port,site,enabled,node_id,sort_order,config_version,desired_config,updated_at FROM fleet_devices WHERE deleted_at IS NULL ORDER BY sort_order,name LIMIT 500'),
      pool.query('SELECT a.id,a.device_id,a.actor_id,a.action,a.detail,a.created_at FROM fleet_audit a ORDER BY a.created_at DESC LIMIT 100')]);
    return send(res,200,{devices:devices.rows,events:events.rows,accessLevel:level});
  }
  if(path==='/api/admin/servers/devices'&&req.method==='POST'){
    if(!allowed('manage'))return send(res,403,{error:'Fleet management access required'});
    const b=await readJson(req);
    if(!validDevice(b))return send(res,400,{error:'Valid device inventory and structured configuration required'});
    const db=await pool.connect();try{
      await db.query('START TRANSACTION');
      if(!await linkedNode(db,b.nodeId)){await db.query('ROLLBACK');return send(res,400,{error:'Linked switch unavailable'});}
      const id=randomUUID();
      await db.query('INSERT INTO fleet_devices(id,name,kind,host,port,site,enabled,node_id,sort_order,desired_config,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,(SELECT COALESCE(MAX(sort_order),0)+1 FROM (SELECT sort_order FROM fleet_devices) ordered),$9,$10)',
        [id,b.name,b.kind,b.host,b.port,b.site,b.enabled,b.nodeId||null,JSON.stringify(b.config),user.id]);
      await db.query('INSERT INTO fleet_config_revisions(id,device_id,version,configuration,actor_id) VALUES($1,$2,1,$3,$4)',[randomUUID(),id,JSON.stringify(b.config),user.id]);
      await audit(db,user,'device_added',b.name,id);
      await db.query('COMMIT');return send(res,201,{id,version:1});
    }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Device name already exists'});throw e;}finally{db.release();}
  }
  if(path==='/api/admin/servers/devices/order'&&req.method==='PUT'){
    if(!allowed('manage'))return send(res,403,{error:'Fleet management access required'});
    const {ids}=await readJson(req);
    if(!Array.isArray(ids)||ids.length>500||new Set(ids).size!==ids.length||ids.some(id=>!uuid.test(id)))return send(res,400,{error:'Unique device IDs required'});
    const db=await pool.connect();try{
      await db.query('START TRANSACTION');
      const live=await db.query('SELECT id FROM fleet_devices WHERE deleted_at IS NULL FOR UPDATE');
      if(live.rowCount!==ids.length||live.rows.some(row=>!ids.includes(row.id))){await db.query('ROLLBACK');return send(res,409,{error:'Refresh device list before reordering'});}
      for(let i=0;i<ids.length;i++)await db.query('UPDATE fleet_devices SET sort_order=$1 WHERE id=$2',[i+1,ids[i]]);
      await audit(db,user,'devices_reordered',`${ids.length} devices`);
      await db.query('COMMIT');return send(res,200,{ordered:true});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  const match=/^\/api\/admin\/servers\/devices\/([0-9a-f-]{36})(?:\/(revisions|dump))?$/.exec(path);
  if(match&&uuid.test(match[1])){
    const id=match[1],suffix=match[2];
    if(req.method==='GET'&&suffix==='revisions'){
      if(!allowed('view'))return send(res,403,{error:'Fleet view access required'});
      const result=await pool.query('SELECT r.version,r.configuration,r.actor_id,r.created_at FROM fleet_config_revisions r JOIN fleet_devices d ON d.id=r.device_id WHERE d.id=$1 AND d.deleted_at IS NULL ORDER BY r.version DESC LIMIT 100',[id]);
      return send(res,200,{revisions:result.rows});
    }
    if(req.method==='GET'&&suffix==='dump'){
      if(!allowed('view'))return send(res,403,{error:'Fleet view access required'});
      const result=await pool.query('SELECT name,kind,host,port,site,enabled,node_id,config_version,desired_config,updated_at FROM fleet_devices WHERE id=$1 AND deleted_at IS NULL',[id]);
      if(!result.rowCount)return send(res,404,{error:'Device unavailable'});
      return send(res,200,{format:'olamide-fleet-intent-v1',device:result.rows[0],applied:false});
    }
    if(req.method==='PUT'&&!suffix){
      if(!allowed('manage'))return send(res,403,{error:'Fleet management access required'});
      const b=await readJson(req);
      if(!validDevice(b)||!Number.isInteger(b.expectedVersion)||b.expectedVersion<1)return send(res,400,{error:'Valid device configuration and expected version required'});
      const db=await pool.connect();try{
        await db.query('START TRANSACTION');
        const old=await db.query('SELECT config_version FROM fleet_devices WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[id]);
        if(!old.rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Device unavailable'});}
        if(old.rows[0].config_version!==b.expectedVersion){await db.query('ROLLBACK');return send(res,409,{error:'Configuration changed; refresh before saving'});}
        if(!await linkedNode(db,b.nodeId)){await db.query('ROLLBACK');return send(res,400,{error:'Linked switch unavailable'});}
        const version=b.expectedVersion+1;
        await db.query('UPDATE fleet_devices SET name=$1,kind=$2,host=$3,port=$4,site=$5,enabled=$6,node_id=$7,desired_config=$8,config_version=$9 WHERE id=$10',
          [b.name,b.kind,b.host,b.port,b.site,b.enabled,b.nodeId||null,JSON.stringify(b.config),version,id]);
        await db.query('INSERT INTO fleet_config_revisions(id,device_id,version,configuration,actor_id) VALUES($1,$2,$3,$4,$5)',
          [randomUUID(),id,version,JSON.stringify(b.config),user.id]);
        await audit(db,user,'device_updated',`${b.name} version ${version}`,id);
        await db.query('COMMIT');return send(res,200,{version});
      }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Device name already exists'});throw e;}finally{db.release();}
    }
    if(req.method==='DELETE'&&!suffix){
      if(!allowed('manage'))return send(res,403,{error:'Fleet management access required'});
      const db=await pool.connect();try{
        await db.query('START TRANSACTION');
        const result=await db.query('UPDATE fleet_devices SET deleted_at=UTC_TIMESTAMP(3),enabled=FALSE WHERE id=$1 AND deleted_at IS NULL',[id]);
        if(result.rowCount)await audit(db,user,'device_deleted',id,id);
        await db.query('COMMIT');return send(res,result.rowCount?200:404,result.rowCount?{deleted:true}:{error:'Device unavailable'});
      }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
    }
  }
  return send(res,404,{error:'Fleet network route unavailable'});
}
