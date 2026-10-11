import {randomUUID} from 'node:crypto';
export async function migrateUserActivity(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS user_activity_events (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,
    source VARCHAR(12) NOT NULL,event_type VARCHAR(24) NOT NULL,target VARCHAR(80) NOT NULL,
    outcome VARCHAR(16) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX activity_recent(tenant_id,created_at),INDEX activity_user(user_id,created_at)
  ) ENGINE=InnoDB`);
}
export async function recordApiActivity(pool,user,method,path,status){
  // Route categories only: no query strings, object IDs, credentials or body contents.
  const target='/'+path.split('?')[0].split('/').filter(Boolean).slice(0,3).map(part=>/^[a-z-]{1,40}$/.test(part)?part:'item').join('/');
  await pool.query('INSERT INTO user_activity_events(id,tenant_id,user_id,source,event_type,target,outcome) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [randomUUID(),user.tenant_id,user.id,'server',method,target,status<400?'success':'failed']);
}
const targets=new Set(['workspace','calling','commerce','settings','administration','fleet','help']);
const types=new Set(['navigate','interaction','heartbeat']);
export async function handleUserActivity({req,res,path,user,pool,send,readJson,url}){
  if(path==='/api/activity/events'&&req.method==='POST'){
    const body=await readJson(req);
    if(!body||Object.keys(body).some(k=>k!=='events')||!Array.isArray(body.events)||!body.events.length||body.events.length>20||
      body.events.some(e=>!e||Object.keys(e).some(k=>!['type','target'].includes(k))||!types.has(e.type)||!targets.has(e.target)))
      return send(res,400,{error:'Choose supported activity types and workspace categories'});
    // Database rate limiting works across API replicas.
    const db=await pool.connect();
    try{
      await db.query('START TRANSACTION');
      await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
      const recent=await db.query("SELECT COUNT(*) AS count FROM user_activity_events WHERE user_id=$1 AND source='browser' AND created_at>DATE_SUB(NOW(),INTERVAL 1 MINUTE)",[user.id]);
      if(Number(recent.rows[0].count)+body.events.length>120){await db.query('ROLLBACK');return send(res,429,{error:'Activity rate limit reached'});}
      for(const e of body.events)await db.query('INSERT INTO user_activity_events(id,tenant_id,user_id,source,event_type,target,outcome) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [randomUUID(),user.tenant_id,user.id,'browser',e.type,e.target,'reported']);
      await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
    await pool.query('DELETE FROM user_activity_events WHERE created_at<DATE_SUB(NOW(),INTERVAL 90 DAY) LIMIT 1000');
    return send(res,202,{received:body.events.length});
  }
  if((path==='/api/activity/events'||path==='/api/admin/activity/events')&&req.method==='GET'){
    const admin=path.startsWith('/api/admin/');
    if(admin&&!['admin','super_admin'].includes(user.role))return send(res,403,{error:'Administrator required'});
    const limit=Number(url.searchParams.get('limit')||50);
    const before=url.searchParams.get('before');
    if(!Number.isSafeInteger(limit)||limit<1||limit>100||(before&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(before)))return send(res,400,{error:'Invalid activity filter'});
    const args=[user.tenant_id];let scope='tenant_id=$1 AND created_at>=DATE_SUB(NOW(),INTERVAL 90 DAY)';
    if(!admin){args.push(user.id);scope+=' AND user_id=$'+args.length;}
    if(before){args.push(new Date(before));scope+=' AND created_at<$'+args.length;}
    args.push(limit);
    const events=await pool.query(`SELECT id,user_id,source,event_type,target,outcome,created_at FROM user_activity_events WHERE ${scope} ORDER BY created_at DESC,id DESC LIMIT $${args.length}`,args);
    return send(res,200,{events:events.rows,scope:admin?'tenant':'self',retentionDays:90});
  }
  return send(res,405,{error:'Activity method unavailable'});
}
