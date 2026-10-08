import { randomUUID } from 'node:crypto';
import { isAdmin } from './tenancy.js';
const idRe=/^[0-9a-f-]{36}$/i;
const date=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
export async function migrateCampaigns(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS campaigns (id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NULL,creator_id CHAR(36) NOT NULL,title VARCHAR(160) NOT NULL,body TEXT NOT NULL,status VARCHAR(12) NOT NULL DEFAULT 'draft',publish_at DATETIME(3) NULL,expires_at DATETIME(3) NULL,revision INT NOT NULL DEFAULT 1,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(creator_id) REFERENCES users(id),INDEX campaign_due(status,publish_at,tenant_id)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS campaign_reads (campaign_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY(campaign_id,user_id),FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS campaign_events (id CHAR(36) PRIMARY KEY,campaign_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,action VARCHAR(24) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(campaign_id) REFERENCES campaigns(id),FOREIGN KEY(actor_id) REFERENCES users(id)) ENGINE=InnoDB`);
}
const sqlDate=x=>x?new Date(x).toISOString().slice(0,23).replace('T',' '):null;
function validate(b){return b&&typeof b.title==='string'&&b.title.trim().length>=2&&b.title.length<=160&&typeof b.body==='string'&&b.body.trim().length>=2&&b.body.length<=4000&&(!b.publishAt||date(b.publishAt))&&(!b.expiresAt||date(b.expiresAt))&&(!b.expiresAt||Date.parse(b.expiresAt)>Date.parse(b.publishAt||new Date().toISOString()));}
export async function handleCampaigns({req,res,path,user,pool,send,readJson}){
  if(path==='/api/campaigns/inbox'&&req.method==='GET'){
    const r=await pool.query(`SELECT c.id,c.title,c.body,c.publish_at,c.expires_at,c.tenant_id,(cr.user_id IS NOT NULL) AS acknowledged FROM campaigns c LEFT JOIN campaign_reads cr ON cr.campaign_id=c.id AND cr.user_id=$1 WHERE c.status='published' AND (c.tenant_id=$2 OR c.tenant_id IS NULL) AND c.publish_at<=UTC_TIMESTAMP(3) AND (c.expires_at IS NULL OR c.expires_at>UTC_TIMESTAMP(3)) ORDER BY c.publish_at DESC LIMIT 100`,[user.id,user.tenant_id]);
    return send(res,200,{notifications:r.rows});
  }
  const read=/^\/api\/campaigns\/([0-9a-f-]{36})\/ack$/.exec(path);
  if(read&&idRe.test(read[1])&&req.method==='POST'){
    const r=await pool.query(`INSERT IGNORE INTO campaign_reads(campaign_id,user_id) SELECT id,$1 FROM campaigns WHERE id=$2 AND status='published' AND (tenant_id=$3 OR tenant_id IS NULL) AND publish_at<=UTC_TIMESTAMP(3) AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP(3))`,[user.id,read[1],user.tenant_id]);
    return r.rowCount?send(res,200,{acknowledged:true}):send(res,404,{error:'Notification unavailable'});
  }
  if(!isAdmin(user))return send(res,403,{error:'Administrator access required'});
  if(path==='/api/admin/campaigns'&&req.method==='GET'){
    const r=await pool.query(`SELECT c.*,u.display_name AS creator_name FROM campaigns c JOIN users u ON u.id=c.creator_id WHERE c.tenant_id=$1 OR (c.tenant_id IS NULL AND $2='super_admin') ORDER BY c.created_at DESC LIMIT 200`,[user.tenant_id,user.role]);
    return send(res,200,{campaigns:r.rows});
  }
  if(path==='/api/admin/campaigns'&&req.method==='POST'){
    const b=await readJson(req);if(!validate(b)||b.tenantId!==undefined&&b.tenantId!==null&&b.tenantId!==user.tenant_id||b.tenantId===null&&user.role!=='super_admin')return send(res,400,{error:'Valid campaign and authorized tenant required'});
    const id=randomUUID(),tenant=b.tenantId===null?null:user.tenant_id;
    await pool.query('INSERT INTO campaigns(id,tenant_id,creator_id,title,body,publish_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,tenant,user.id,b.title.trim(),b.body.trim(),sqlDate(b.publishAt),sqlDate(b.expiresAt)]);
    await pool.query("INSERT INTO campaign_events(id,campaign_id,actor_id,action) VALUES($1,$2,$3,'created')",[randomUUID(),id,user.id]);return send(res,201,{id});
  }
  const m=/^\/api\/admin\/campaigns\/([0-9a-f-]{36})(?:\/(publish|pause|archive|events))?$/.exec(path);
  if(!m||!idRe.test(m[1]))return send(res,404,{error:'Campaign route unavailable'});
  const id=m[1],action=m[2];
  if(action==='events'&&req.method==='GET'){
    const found=await pool.query('SELECT id FROM campaigns WHERE id=$1 AND (tenant_id=$2 OR tenant_id IS NULL AND $3=\'super_admin\')',[id,user.tenant_id,user.role]);if(!found.rowCount)return send(res,404,{error:'Campaign unavailable'});
    const r=await pool.query('SELECT action,actor_id,created_at FROM campaign_events WHERE campaign_id=$1 ORDER BY created_at DESC LIMIT 100',[id]);return send(res,200,{events:r.rows});
  }
  if(req.method==='PUT'||req.method==='POST'&&['publish','pause','archive'].includes(action)){
    const b=await readJson(req);if(!Number.isInteger(b.revision)||b.revision<1||req.method==='PUT'&&!validate(b))return send(res,400,{error:'Valid campaign and revision required'});
    const db=await pool.connect();try{await db.query('START TRANSACTION');
      const found=await db.query('SELECT * FROM campaigns WHERE id=$1 AND (tenant_id=$2 OR tenant_id IS NULL AND $3=\'super_admin\') FOR UPDATE',[id,user.tenant_id,user.role]);const row=found.rows[0];
      if(!row){await db.query('ROLLBACK');return send(res,404,{error:'Campaign unavailable'});}
      if(row.revision!==b.revision){await db.query('ROLLBACK');return send(res,409,{error:'Campaign changed; refresh'});}
      if(row.status==='archived'||req.method==='PUT'&&row.status!=='draft'||action==='publish'&&row.status!=='draft'||action==='pause'&&row.status!=='published'){
        await db.query('ROLLBACK');return send(res,409,{error:'Invalid campaign transition'});}
      if(req.method==='PUT')await db.query('UPDATE campaigns SET title=$1,body=$2,publish_at=$3,expires_at=$4,revision=revision+1 WHERE id=$5',[b.title.trim(),b.body.trim(),sqlDate(b.publishAt),sqlDate(b.expiresAt),id]);
      else {if(action==='publish'&&(!row.publish_at||new Date(row.publish_at).getTime()<Date.now()-60000)){await db.query('ROLLBACK');return send(res,400,{error:'Schedule a current or future publish time first'});}
        await db.query('UPDATE campaigns SET status=$1,revision=revision+1 WHERE id=$2',[action==='publish'?'published':action==='pause'?'draft':'archived',id]);}
      await db.query('INSERT INTO campaign_events(id,campaign_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),id,user.id,action||'edited']);await db.query('COMMIT');return send(res,200,{revision:b.revision+1});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  return send(res,404,{error:'Campaign route unavailable'});
}
