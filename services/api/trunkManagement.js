import {randomUUID} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=b=>b&&typeof b.name==='string'&&b.name.trim().length>0&&b.name.length<=100&&typeof b.host==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,253}$/.test(b.host)&&Number.isInteger(b.port)&&b.port>=1&&b.port<=65535&&['udp','tcp','tls'].includes(b.transport)&&Number.isInteger(b.priority)&&b.priority>=1&&b.priority<=1000;
const snapshot=t=>({name:t.name,host:t.host,port:t.port,transport:t.transport,priority:t.priority,enabled:!!t.enabled,revision:t.revision});
export async function migrateTrunkManagement(pool){
  const columns=await pool.query("SELECT column_name AS column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pbx_trunks' AND column_name IN ('revision','updated_at')");
  const has=new Set(columns.rows.map(x=>x.column_name));
  if(!has.has('revision'))await pool.query('ALTER TABLE pbx_trunks ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 1');
  if(!has.has('updated_at'))await pool.query('ALTER TABLE pbx_trunks ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)');
  await pool.query(`CREATE TABLE IF NOT EXISTS pbx_trunk_events(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,trunk_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,action VARCHAR(24) NOT NULL,snapshot JSON NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(actor_id) REFERENCES users(id),INDEX trunk_history(tenant_id,trunk_id,created_at)) ENGINE=InnoDB`);
}
const readTrunk=async(db,id,tenant)=> (await db.query('SELECT id,name,host,port,transport,priority,enabled,revision,updated_at FROM pbx_trunks WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[id,tenant])).rows[0];
const event=async(db,tenant,trunk,user,action)=>db.query('INSERT INTO pbx_trunk_events(id,tenant_id,trunk_id,actor_id,action,snapshot) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),tenant,trunk.id,user.id,action,JSON.stringify(snapshot(trunk))]);
export async function handleTrunks({req,res,path,user,pool,send,readJson}){
  const tenant=user.tenant_id;
  if(path==='/api/pbx/trunks'&&req.method==='GET'){
    const rows=await pool.query(`SELECT t.id,t.name,t.host,t.port,t.transport,t.priority,t.enabled,t.revision,t.updated_at,
      (SELECT COUNT(*) FROM pbx_rates r WHERE r.trunk_id=t.id AND r.tenant_id=t.tenant_id) AS rate_count,
      (SELECT COUNT(*) FROM carrier_provider_profiles p WHERE p.trunk_id=t.id AND p.tenant_id=t.tenant_id) AS carrier_count,
      (SELECT COUNT(*) FROM carrier_provider_profiles p WHERE p.trunk_id=t.id AND p.tenant_id=t.tenant_id AND p.status='active') AS active_carriers
      FROM pbx_trunks t WHERE t.tenant_id=$1 ORDER BY t.priority,t.name LIMIT 300`,[tenant]);
    return send(res,200,{trunks:rows.rows});
  }
  if(path==='/api/pbx/trunks'&&req.method==='POST'){
    const b=await readJson(req);if(!valid(b))return send(res,400,{error:'Valid trunk name, host, port, transport and priority required'});
    const id=randomUUID(),db=await pool.connect();try{await db.query('BEGIN');
      await db.query('INSERT INTO pbx_trunks(id,tenant_id,name,host,port,transport,priority) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,tenant,b.name.trim(),b.host.toLowerCase(),b.port,b.transport,b.priority]);
      await event(db,tenant,{id,...b,name:b.name.trim(),host:b.host.toLowerCase(),enabled:false,revision:1},user,'created');await db.query('COMMIT');return send(res,201,{id,enabled:false,revision:1,simulationOnly:true});
    }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Trunk name exists'});throw e;}finally{db.release();}
  }
  if(path==='/api/pbx/trunks/batch'&&req.method==='PUT'){
    const b=await readJson(req);if(typeof b.enabled!=='boolean'||!Array.isArray(b.trunks)||b.trunks.length<1||b.trunks.length>50||new Set(b.trunks.map(t=>t?.id)).size!==b.trunks.length||b.trunks.some(t=>!uuid.test(t?.id||'')||!Number.isSafeInteger(t.revision)||t.revision<1))return send(res,400,{error:'Select 1–50 distinct trunks with current revisions'});
    const db=await pool.connect();try{await db.query('BEGIN');for(const item of [...b.trunks].sort((a,c)=>a.id.localeCompare(c.id))){
      const trunk=await readTrunk(db,item.id,tenant);if(!trunk||Number(trunk.revision)!==item.revision){await db.query('ROLLBACK');return send(res,409,{error:'Trunk changed or unavailable; refresh before retrying'});}
      if(user.role!=='super_admin'&&(await db.query("SELECT 1 FROM carrier_provider_profiles WHERE tenant_id=$1 AND trunk_id=$2 AND provider='flowroute'",[tenant,item.id])).rowCount){
        await db.query('ROLLBACK');return send(res,403,{error:'Super administrator required for Flowroute trunk'});
      }
      await db.query('UPDATE pbx_trunks SET enabled=$1,revision=revision+1 WHERE id=$2 AND tenant_id=$3',[b.enabled,item.id,tenant]);await event(db,tenant,{...trunk,enabled:b.enabled,revision:item.revision+1},user,b.enabled?'preview_enabled':'preview_disabled');
    }await db.query('COMMIT');return send(res,200,{updated:b.trunks.length,enabled:b.enabled,simulationOnly:true});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  const match=/^\/api\/pbx\/trunks\/([0-9a-f-]{36})(?:\/(status|history|export))?$/i.exec(path);
  if(!match||!uuid.test(match[1]))return send(res,404,{error:'Trunk route unavailable'});
  const id=match[1],action=match[2];
  if(!action&&req.method==='GET'){
    const trunk=(await pool.query('SELECT id,name,host,port,transport,priority,enabled,revision,updated_at FROM pbx_trunks WHERE id=$1 AND tenant_id=$2',
      [id,tenant])).rows[0];
    if(!trunk)return send(res,404,{error:'Trunk unavailable'});
    const [rates,carriers]=await Promise.all([
      pool.query('SELECT prefix,cost_cents_per_minute,price_cents_per_minute FROM pbx_rates WHERE trunk_id=$1 AND tenant_id=$2 ORDER BY prefix LIMIT 100',[id,tenant]),
      pool.query('SELECT provider,status,routing_mode,max_concurrent_calls FROM carrier_provider_profiles WHERE trunk_id=$1 AND tenant_id=$2 ORDER BY provider',[id,tenant])
    ]);
    return send(res,200,{trunk,rates:rates.rows,carriers:carriers.rows,
      scope:'Configuration and linked inventory only; SIP reachability and carrier activation are not verified'});
  }
  if(action==='history'&&req.method==='GET'){
    const rows=await pool.query('SELECT action,snapshot,actor_id,created_at FROM pbx_trunk_events WHERE trunk_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 100',[id,tenant]);
    return rows.rowCount?send(res,200,{events:rows.rows}):send(res,404,{error:'Trunk history unavailable'});
  }
  if(action==='export'&&req.method==='GET'){
    const row=(await pool.query('SELECT id,name,host,port,transport,priority,enabled,revision FROM pbx_trunks WHERE id=$1 AND tenant_id=$2',[id,tenant])).rows[0];
    return row?send(res,200,{trunk:snapshot(row),id:row.id,simulationOnly:true,credentialsIncluded:false}):send(res,404,{error:'Trunk unavailable'});
  }
  if((req.method==='PUT'&&(!action||action==='status'))||(req.method==='DELETE'&&!action)){
    const b=req.method==='PUT'?await readJson(req):{};
    if(req.method==='PUT'&&(!Number.isSafeInteger(b.revision)||b.revision<1||(action==='status'?typeof b.enabled!=='boolean':!valid(b))))return send(res,400,{error:'Valid trunk configuration and revision required'});
    const db=await pool.connect();try{await db.query('BEGIN');const trunk=await readTrunk(db,id,tenant);if(!trunk){await db.query('ROLLBACK');return send(res,404,{error:'Trunk unavailable'});}
      if(user.role!=='super_admin'&&(await db.query("SELECT 1 FROM carrier_provider_profiles WHERE tenant_id=$1 AND trunk_id=$2 AND provider='flowroute'",[tenant,id])).rowCount){
        await db.query('ROLLBACK');return send(res,403,{error:'Super administrator required for Flowroute trunk'});
      }
      if(req.method==='PUT'&&Number(trunk.revision)!==b.revision){await db.query('ROLLBACK');return send(res,409,{error:'Trunk changed; refresh before saving'});}
      if(req.method==='DELETE'||!action){const deps=await db.query(`SELECT (SELECT COUNT(*) FROM pbx_rates WHERE trunk_id=$1 AND tenant_id=$2) AS rates,(SELECT COUNT(*) FROM carrier_provider_profiles WHERE trunk_id=$1 AND tenant_id=$2) AS carriers`,[id,tenant]);
        if(req.method==='DELETE'&&(Number(deps.rows[0].rates)||Number(deps.rows[0].carriers))){await db.query('ROLLBACK');return send(res,409,{error:'Remove linked rates and carrier profiles before deleting this trunk'});}
        if(req.method==='PUT'&&Number(deps.rows[0].carriers)){const active=await db.query("SELECT 1 FROM carrier_provider_profiles WHERE trunk_id=$1 AND tenant_id=$2 AND status='active' LIMIT 1",[id,tenant]);if(active.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Deactivate the carrier adapter before editing its trunk'});}}
      }
      if(req.method==='DELETE'){await event(db,tenant,trunk,user,'deleted');await db.query('DELETE FROM pbx_trunks WHERE id=$1 AND tenant_id=$2',[id,tenant]);await db.query('COMMIT');return send(res,200,{deleted:true});}
      if(action==='status')await db.query('UPDATE pbx_trunks SET enabled=$1,revision=revision+1 WHERE id=$2 AND tenant_id=$3',[b.enabled,id,tenant]);
      else await db.query('UPDATE pbx_trunks SET name=$1,host=$2,port=$3,transport=$4,priority=$5,revision=revision+1 WHERE id=$6 AND tenant_id=$7',[b.name.trim(),b.host.toLowerCase(),b.port,b.transport,b.priority,id,tenant]);
      await event(db,tenant,{...trunk,...(action==='status'?{enabled:b.enabled}:{name:b.name.trim(),host:b.host.toLowerCase(),port:b.port,transport:b.transport,priority:b.priority}),revision:b.revision+1},user,action==='status'?(b.enabled?'preview_enabled':'preview_disabled'):'edited');await db.query('COMMIT');return send(res,200,{revision:b.revision+1,simulationOnly:true});
    }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Trunk name exists'});throw e;}finally{db.release();}
  }
  return send(res,404,{error:'Trunk route unavailable'});
}
