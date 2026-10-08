import {randomUUID} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const email=x=>typeof x==='string'&&x.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
const date=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
const sqlDate=x=>x?new Date(x).toISOString().slice(0,23).replace('T',' '):null;
export function validWorkItem(b){
  if(!b||!['task','event'].includes(b.kind)||!['parked','scheduled','completed','cancelled'].includes(b.status)||
    typeof b.title!=='string'||b.title.trim().length<2||b.title.length>160||
    typeof b.description!=='string'||b.description.length>2000)return false;
  if(b.status==='scheduled'){
    if(!date(b.startAt)||Date.parse(b.startAt)<Date.now()-60000||Date.parse(b.startAt)>Date.now()+366*86400000)return false;
    if(b.kind==='event'&&(!date(b.endAt)||Date.parse(b.endAt)<=Date.parse(b.startAt)||Date.parse(b.endAt)-Date.parse(b.startAt)>7*86400000))return false;
  }
  return b.status!=='parked'||(!b.startAt&&!b.endAt);
}
export async function migrateWorkPlanner(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS work_items (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,creator_id CHAR(36) NOT NULL,
    kind VARCHAR(8) NOT NULL,title VARCHAR(160) NOT NULL,description VARCHAR(2000) NOT NULL,
    status VARCHAR(12) NOT NULL,start_at DATETIME(3) NULL,end_at DATETIME(3) NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),deleted_at DATETIME(3) NULL,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(creator_id) REFERENCES users(id),
    INDEX tenant_work(tenant_id,status,start_at)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS work_item_shares (
    item_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,permission VARCHAR(8) NOT NULL,
    PRIMARY KEY(item_id,user_id),FOREIGN KEY(item_id) REFERENCES work_items(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS work_item_audit (
    id CHAR(36) PRIMARY KEY,item_id CHAR(36) NOT NULL,actor_id CHAR(36) NOT NULL,
    action VARCHAR(24) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(item_id) REFERENCES work_items(id) ON DELETE CASCADE,
    FOREIGN KEY(actor_id) REFERENCES users(id),INDEX item_events(item_id,created_at)
  ) ENGINE=InnoDB`);
}
async function audit(db,id,userId,action){await db.query('INSERT INTO work_item_audit(id,item_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),id,userId,action]);}
async function access(db,id,user){
  const found=await db.query(`SELECT w.*,s.permission FROM work_items w LEFT JOIN work_item_shares s ON s.item_id=w.id AND s.user_id=$2
    WHERE w.id=$1 AND w.tenant_id=$3 AND w.deleted_at IS NULL AND (w.creator_id=$2 OR s.user_id=$2)`,[id,user.id,user.tenant_id]);
  return found.rows[0];
}
async function replaceShares(db,id,user,shares){
  if(!Array.isArray(shares)||shares.length>20||new Set(shares.map(s=>s?.email?.trim().toLowerCase())).size!==shares.length||
    shares.some(s=>!email(s?.email)||!['view','edit'].includes(s.permission)))return false;
  const normalized=shares.map(s=>({email:s.email.trim().toLowerCase(),permission:s.permission}));
  const users=[];
  for(const share of normalized){
    const found=await db.query("SELECT id FROM users WHERE email=$1 AND tenant_id=$2 AND status='active'",[share.email,user.tenant_id]);
    if(!found.rowCount||found.rows[0].id===user.id)return false;
    users.push({id:found.rows[0].id,permission:share.permission});
  }
  await db.query('DELETE FROM work_item_shares WHERE item_id=$1',[id]);
  for(const share of users)await db.query('INSERT INTO work_item_shares(item_id,user_id,permission) VALUES($1,$2,$3)',[id,share.id,share.permission]);
  return true;
}
export async function handleWorkPlanner({req,res,path,user,pool,send,readJson}){
  if(path==='/api/work/items'&&req.method==='GET'){
    const rows=await pool.query(`SELECT w.id,w.kind,w.title,w.description,w.status,w.start_at,w.end_at,w.version,w.creator_id,w.updated_at,
      s.permission AS shared_permission,u.display_name AS creator_name
      FROM work_items w JOIN users u ON u.id=w.creator_id LEFT JOIN work_item_shares s ON s.item_id=w.id AND s.user_id=$1
      WHERE w.tenant_id=$2 AND w.deleted_at IS NULL AND (w.creator_id=$1 OR s.user_id=$1)
      ORDER BY CASE w.status WHEN 'scheduled' THEN 0 WHEN 'parked' THEN 1 ELSE 2 END,w.start_at,w.updated_at DESC LIMIT 300`,[user.id,user.tenant_id]);
    return send(res,200,{items:rows.rows,viewerId:user.id,serverTime:new Date().toISOString()});
  }
  if(path==='/api/work/items'&&req.method==='POST'){
    const b=await readJson(req);if(!validWorkItem(b)||!['parked','scheduled'].includes(b.status))return send(res,400,{error:'Valid task or event and schedule required'});
    const id=randomUUID(),db=await pool.connect();try{
      await db.query('START TRANSACTION');
      await db.query('INSERT INTO work_items(id,tenant_id,creator_id,kind,title,description,status,start_at,end_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id,user.tenant_id,user.id,b.kind,b.title.trim(),b.description,b.status,b.status==='scheduled'?sqlDate(b.startAt):null,b.status==='scheduled'&&b.kind==='event'?sqlDate(b.endAt):null]);
      if(!await replaceShares(db,id,user,b.shares||[])){await db.query('ROLLBACK');return send(res,400,{error:'Share only with active users in this tenant'});}
      await audit(db,id,user.id,'created');await db.query('COMMIT');return send(res,201,{id,version:1});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  const match=/^\/api\/work\/items\/([0-9a-f-]{36})(?:\/(history|shares))?$/.exec(path);
  if(!match||!uuid.test(match[1]))return send(res,404,{error:'Work item route unavailable'});
  const id=match[1],suffix=match[2];
  if(req.method==='GET'&&suffix==='history'){
    const item=await access(pool,id,user);if(!item)return send(res,404,{error:'Item unavailable'});
    const result=await pool.query('SELECT action,actor_id,created_at FROM work_item_audit WHERE item_id=$1 ORDER BY created_at DESC LIMIT 100',[id]);
    return send(res,200,{events:result.rows});
  }
  if(req.method==='GET'&&suffix==='shares'){
    const item=await access(pool,id,user);if(!item)return send(res,404,{error:'Item unavailable'});
    const result=await pool.query('SELECT u.email,u.display_name,s.permission FROM work_item_shares s JOIN users u ON u.id=s.user_id WHERE s.item_id=$1 ORDER BY u.email',[id]);
    return send(res,200,{shares:result.rows});
  }
  if(req.method==='PUT'&&!suffix){
    const b=await readJson(req);if(!validWorkItem(b)||!Number.isInteger(b.expectedVersion)||b.expectedVersion<1)return send(res,400,{error:'Valid item and version required'});
    const db=await pool.connect();try{
      await db.query('START TRANSACTION');const item=await access(db,id,user);
      if(!item){await db.query('ROLLBACK');return send(res,404,{error:'Item unavailable'});}
      if(item.creator_id!==user.id&&item.permission!=='edit'){await db.query('ROLLBACK');return send(res,403,{error:'Edit access required'});}
      const updated=await db.query('UPDATE work_items SET kind=$1,title=$2,description=$3,status=$4,start_at=$5,end_at=$6,version=version+1 WHERE id=$7 AND tenant_id=$8 AND version=$9',
        [b.kind,b.title.trim(),b.description,b.status,b.status==='scheduled'?sqlDate(b.startAt):null,b.status==='scheduled'&&b.kind==='event'?sqlDate(b.endAt):null,id,user.tenant_id,b.expectedVersion]);
      if(!updated.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Item changed; refresh before saving'});}
      await audit(db,id,user.id,'updated');await db.query('COMMIT');return send(res,200,{version:b.expectedVersion+1});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  if(req.method==='PUT'&&suffix==='shares'){
    const {shares}=await readJson(req),db=await pool.connect();try{
      await db.query('START TRANSACTION');const item=await access(db,id,user);
      if(!item){await db.query('ROLLBACK');return send(res,404,{error:'Item unavailable'});}
      if(item.creator_id!==user.id){await db.query('ROLLBACK');return send(res,403,{error:'Only the creator can share this item'});}
      if(!await replaceShares(db,id,user,shares)){await db.query('ROLLBACK');return send(res,400,{error:'Share only with active users in this tenant'});}
      await audit(db,id,user.id,'shares_updated');await db.query('COMMIT');return send(res,200,{shared:true});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  if(req.method==='DELETE'&&!suffix){
    const db=await pool.connect();try{await db.query('START TRANSACTION');const item=await access(db,id,user);
      if(!item){await db.query('ROLLBACK');return send(res,404,{error:'Item unavailable'});}
      if(item.creator_id!==user.id){await db.query('ROLLBACK');return send(res,403,{error:'Only the creator can delete this item'});}
      await db.query('UPDATE work_items SET deleted_at=UTC_TIMESTAMP(3) WHERE id=$1 AND tenant_id=$2',[id,user.tenant_id]);
      await audit(db,id,user.id,'deleted');
      await db.query('COMMIT');return send(res,200,{deleted:true});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  return send(res,404,{error:'Work item route unavailable'});
}
