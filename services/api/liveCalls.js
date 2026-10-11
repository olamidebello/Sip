import {randomUUID} from 'node:crypto';
import {isAdmin} from './tenancy.js';
import {verifyCdrSignature} from './cdr.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const token=/^[a-zA-Z0-9_.:+-]{1,80}$/;
const number=/^(?:\+[1-9]\d{7,14}|[0-9]{2,10})$/;
export function validateCallEvent(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!uuid.test(value.tenantId||'')||
    !uuid.test(value.eventId||'')||!token.test(value.source||'')||!token.test(value.legId||'')||
    !['ringing','answered','heartbeat','ended'].includes(value.event)||
    !['inbound','outbound'].includes(value.direction)||!number.test(value.from||'')||!number.test(value.to||'')||
    typeof value.occurredAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value.occurredAt)||
    !Number.isFinite(Date.parse(value.occurredAt))||Math.abs(Date.now()-Date.parse(value.occurredAt))>300000)
    throw new RangeError('Invalid call event');
  return value;
}

export async function migrateLiveCalls(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS live_call_sessions (
    id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,source VARCHAR(80) NOT NULL,leg_id VARCHAR(80) NOT NULL,
    direction VARCHAR(8) NOT NULL,caller VARCHAR(32) NOT NULL,callee VARCHAR(32) NOT NULL,
    status VARCHAR(12) NOT NULL,started_at DATETIME(3) NOT NULL,answered_at DATETIME(3) NULL,
    ended_at DATETIME(3) NULL,last_event_at DATETIME(3) NOT NULL,
    UNIQUE KEY live_leg(tenant_id,source,leg_id),INDEX live_tenant_status(tenant_id,status,last_event_at),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS live_call_events (
    event_id CHAR(36) PRIMARY KEY,session_id CHAR(36) NOT NULL,event_type VARCHAR(12) NOT NULL,
    occurred_at DATETIME(3) NOT NULL,received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX live_events_session(session_id,occurred_at),FOREIGN KEY(session_id) REFERENCES live_call_sessions(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS live_call_notes (
    id CHAR(36) PRIMARY KEY,session_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,
    actor_id CHAR(36) NOT NULL,body VARCHAR(1000) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX live_notes_session(session_id,created_at),FOREIGN KEY(session_id) REFERENCES live_call_sessions(id),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(actor_id) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}

export async function handleLiveCallIngest({req,res,pool,send,keys}){
  if(!req.headers['content-type']?.startsWith('application/json'))return send(res,400,{error:'JSON required'});
  let raw='';
  try{for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)return send(res,413,{error:'Event too large'});}}
  catch{return send(res,400,{error:'Invalid event body'});}
  let event;
  try{event=validateCallEvent(JSON.parse(raw));}catch{return send(res,400,{error:'Invalid call event'});}
  if(!verifyCdrSignature(keys[event.tenantId],req.headers['x-cdr-timestamp'],raw,req.headers['x-cdr-signature']))
    return send(res,401,{error:'Invalid event signature'});
  const db=await pool.connect();
  try{
    await db.query('START TRANSACTION');
    const tenant=await db.query('SELECT id FROM tenants WHERE id=$1',[event.tenantId]);
    if(!tenant.rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Tenant unavailable'});}
    const exists=await db.query('SELECT session_id FROM live_call_events WHERE event_id=$1',[event.eventId]);
    if(exists.rowCount){await db.query('ROLLBACK');return send(res,200,{accepted:true,duplicate:true});}
    const prior=await db.query('SELECT id,status,last_event_at FROM live_call_sessions WHERE tenant_id=$1 AND source=$2 AND leg_id=$3 FOR UPDATE',
      [event.tenantId,event.source,event.legId]);
    const at=event.occurredAt.slice(0,-1).replace('T',' ');
    if(!prior.rowCount&&event.event!=='ringing'){
      await db.query('ROLLBACK');return send(res,409,{error:'Call start event required'});
    }
    const lastAt=prior.rowCount?new Date(prior.rows[0].last_event_at).getTime():0;
    if(prior.rowCount&&(prior.rows[0].status==='ended'||event.event==='ringing'||
      (event.event==='answered'&&prior.rows[0].status==='answered')||Date.parse(event.occurredAt)<lastAt)){
      await db.query('ROLLBACK');return send(res,409,{error:'Call event is out of order or ended'});
    }
    const id=prior.rows[0]?.id||randomUUID();
    if(!prior.rowCount)await db.query(`INSERT INTO live_call_sessions
      (id,tenant_id,source,leg_id,direction,caller,callee,status,started_at,last_event_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'ringing',$8,$8)`,
      [id,event.tenantId,event.source,event.legId,event.direction,event.from,event.to,at]);
    else await db.query(`UPDATE live_call_sessions SET status=$1,last_event_at=$2,
      answered_at=IF($1='answered' AND answered_at IS NULL,$2,answered_at),
      ended_at=IF($1='ended',$2,ended_at) WHERE id=$3`,
      [event.event==='heartbeat'?prior.rows[0].status:event.event,at,id]);
    await db.query('INSERT INTO live_call_events(event_id,session_id,event_type,occurred_at) VALUES($1,$2,$3,$4)',
      [event.eventId,id,event.event,at]);
    await db.query('COMMIT');return send(res,202,{accepted:true});
  }catch(error){await db.query('ROLLBACK');
    if(error.code==='ER_DUP_ENTRY')return send(res,200,{accepted:true,duplicate:true});
    throw error;
  }finally{db.release();}
}

export async function handleLiveCallsAdmin({req,res,path,user,pool,send,readJson}){
  if(!isAdmin(user))return send(res,403,{error:'Administrator required'});
  if(path==='/api/admin/live-calls'&&req.method==='GET'){
    const active=await pool.query(`SELECT id,source,leg_id,direction,caller,callee,status,started_at,answered_at,last_event_at
      FROM live_call_sessions WHERE tenant_id=$1 AND status IN ('ringing','answered')
      AND last_event_at >= UTC_TIMESTAMP(3)-INTERVAL 2 MINUTE ORDER BY started_at DESC LIMIT 200`,[user.tenant_id]);
    const totals=await pool.query(`SELECT COUNT(*) AS recent_events,MAX(received_at) AS last_received
      FROM live_call_events e JOIN live_call_sessions s ON s.id=e.session_id
      WHERE s.tenant_id=$1 AND e.received_at >= UTC_TIMESTAMP(3)-INTERVAL 5 MINUTE`,[user.tenant_id]);
    const recentEvents=Number(totals.rows[0]?.recent_events||0);
    return send(res,200,{calls:active.rows,source:{recentEvents,
      lastReceived:totals.rows[0]?.last_received||null,feedReady:recentEvents>0},note:'Only signed switch events appear here. Calls without a heartbeat for two minutes are excluded; no switch control is available.'});
  }
  const match=/^\/api\/admin\/live-calls\/([0-9a-f-]{36})\/(notes|history)$/.exec(path);
  if(!match||!uuid.test(match[1]))return send(res,404,{error:'Call unavailable'});
  const found=await pool.query('SELECT id FROM live_call_sessions WHERE id=$1 AND tenant_id=$2',[match[1],user.tenant_id]);
  if(!found.rowCount)return send(res,404,{error:'Call unavailable'});
  if(match[2]==='history'&&req.method==='GET'){
    const [events,notes]=await Promise.all([
      pool.query('SELECT event_type,occurred_at,received_at FROM live_call_events WHERE session_id=$1 ORDER BY occurred_at,event_id LIMIT 100',[match[1]]),
      pool.query('SELECT n.body,n.created_at,u.display_name AS author FROM live_call_notes n JOIN users u ON u.id=n.actor_id WHERE n.session_id=$1 AND n.tenant_id=$2 ORDER BY n.created_at DESC LIMIT 100',[match[1],user.tenant_id])]);
    return send(res,200,{events:events.rows,notes:notes.rows});
  }
  if(match[2]==='notes'&&req.method==='POST'){
    const body=await readJson(req);
    if(typeof body.body!=='string'||!body.body.trim()||body.body.length>1000)
      return send(res,400,{error:'A note of up to 1,000 characters is required'});
    await pool.query('INSERT INTO live_call_notes(id,session_id,tenant_id,actor_id,body) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(),match[1],user.tenant_id,user.id,body.body.trim()]);
    return send(res,201,{saved:true});
  }
  return send(res,405,{error:'Unsupported call action'});
}
