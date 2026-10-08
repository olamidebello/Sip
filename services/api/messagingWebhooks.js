import { randomUUID, timingSafeEqual } from 'node:crypto';
import { isAdmin, defaultTenantId } from './tenancy.js';

export const kinds = ['sms', 'mms', 'sms-dlr', 'mms-dlr'];
const secret = () => process.env.FLOWROUTE_WEBHOOK_TOKEN || '';
const tenant = () => process.env.FLOWROUTE_WEBHOOK_TENANT_ID || defaultTenantId;
const pathFor = kind => `/api/webhooks/flowroute/${secret()}/${kind}`;

export async function migrateMessagingWebhooks(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS flowroute_message_events (
    id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL,
    kind VARCHAR(16) NOT NULL, owner_id CHAR(36) NULL, provider_event_id VARCHAR(128) NOT NULL,
    receipt_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
    sender VARCHAR(32) NOT NULL, recipient VARCHAR(32) NOT NULL,
    body TEXT NULL, status VARCHAR(64) NULL, status_code VARCHAR(64) NULL,
    media_metadata JSON NULL, occurred_at DATETIME(3) NULL,
    received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY flowroute_event_once (tenant_id,kind,provider_event_id,receipt_level),
    INDEX flowroute_recent (tenant_id,received_at),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (owner_id) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS flowroute_sms_numbers (
    number_e164 VARCHAR(16) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
    daily_limit INT UNSIGNED NOT NULL DEFAULT 0, used_today INT UNSIGNED NOT NULL DEFAULT 0,
    usage_day DATE NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX sms_number_owner (tenant_id,user_id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS flowroute_sms_outbound (
    id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
    sender VARCHAR(16) NOT NULL, recipient VARCHAR(16) NOT NULL, body TEXT NOT NULL,
    provider_event_id VARCHAR(128) NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX sms_outbound_user (tenant_id,user_id,created_at),
    UNIQUE KEY sms_provider_event (provider_event_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}

export function normalizeFlowroute(kind, payload) {
  const data = payload?.data ?? payload;
  const attributes = data?.attributes ?? data;
  const isReceipt = kind.endsWith('-dlr');
  if (!data || typeof data !== 'object' || !attributes || typeof attributes !== 'object' ||
      (data.type && data.type !== (isReceipt ? 'delivery_receipt' : 'message')) ||
      typeof data.id !== 'string' || !/^[\w-]{1,128}$/.test(data.id))
    throw new Error('Invalid Flowroute event');
  const sender = attributes.from, recipient = attributes.to;
  if (typeof sender !== 'string' || !/^\+?[0-9]{7,16}$/.test(sender) ||
      typeof recipient !== 'string' || !/^\+?[0-9]{7,16}$/.test(recipient))
    throw new Error('Invalid message addresses');
  const level = isReceipt ? Number(attributes.level) : 0;
  if (isReceipt && ![1,2].includes(level)) throw new Error('Invalid receipt level');
  if (kind === 'mms' && attributes.is_mms === false || kind === 'sms' && attributes.is_mms === true)
    throw new Error('Message type mismatch');
  const body = attributes.body ?? '';
  if (typeof body !== 'string' || body.length > 100000) throw new Error('Invalid message body');
  const status = attributes.status ?? '';
  const statusCode = attributes.status_code ?? '';
  if (typeof status !== 'string' || status.length > 64 || typeof statusCode !== 'string' || statusCode.length > 64)
    throw new Error('Invalid status');
  const timestamp = attributes.timestamp ? new Date(attributes.timestamp) : null;
  if (timestamp && Number.isNaN(timestamp.getTime())) throw new Error('Invalid timestamp');
  const media = kind === 'mms' && Array.isArray(payload.included) ? payload.included.slice(0,20).map(item => ({
    id: String(item.id || '').slice(0,128),
    name: String(item.attributes?.file_name || '').slice(0,255),
    mime: String(item.attributes?.mime_type || '').slice(0,128),
    size: Math.max(0,Number(item.attributes?.file_size) || 0)
  })) : [];
  return {id:data.id,sender,recipient,body,level,status,statusCode,media,timestamp};
}

export async function handleFlowrouteWebhook({req,res,path,pool,send}) {
  const match = /^\/api\/webhooks\/flowroute\/([^/]+)\/(sms|mms|sms-dlr|mms-dlr)$/.exec(path);
  if (!match) return send(res,404,{error:'Webhook unavailable'});
  if (req.method !== 'POST') return send(res,405,{error:'POST required'});
  const configured = secret();
  const candidate = match[1];
  if (configured.length < 32 || candidate.length !== configured.length ||
      !timingSafeEqual(Buffer.from(candidate),Buffer.from(configured)))
    return send(res,404,{error:'Webhook unavailable'});
  if (!/^application\/(json|vnd\.api\+json)(?:\s*;|\s*$)/i.test(req.headers['content-type'] || ''))
    return send(res,415,{error:'JSON required'});
  let raw = '';
  try {
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 1024 * 1024) return send(res,413,{error:'Webhook too large'});
    }
    const event = normalizeFlowroute(match[2], JSON.parse(raw));
    const owner = !match[2].endsWith('-dlr') ? await pool.query(
      'SELECT user_id FROM flowroute_sms_numbers WHERE number_e164=$1 AND tenant_id=$2 AND enabled=TRUE',
      [event.recipient,tenant()]) : {rows:[]};
    const result = await pool.query(`INSERT IGNORE INTO flowroute_message_events
      (id,tenant_id,kind,owner_id,provider_event_id,receipt_level,sender,recipient,body,status,status_code,media_metadata,occurred_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [randomUUID(),tenant(),match[2],owner.rows[0]?.user_id || null,event.id,event.level,event.sender,event.recipient,event.body,
       event.status,event.statusCode,JSON.stringify(event.media),event.timestamp]);
    if (match[2].endsWith('-dlr') && result.rowCount)
      await pool.query("UPDATE flowroute_sms_outbound SET status=$1 WHERE tenant_id=$2 AND provider_event_id=$3",
        [event.status || 'receipt',tenant(),event.id]);
    return send(res,200,{received:true,duplicate:result.rowCount === 0});
  } catch (error) {
    if (error instanceof SyntaxError || error.message.startsWith('Invalid '))
      return send(res,400,{error:'Invalid Flowroute payload'});
    throw error;
  }
}

export async function handleMessagingWebhookAdmin({req,res,user,pool,send,origin}) {
  if (!isAdmin(user) || user.tenant_id !== tenant()) return send(res,403,{error:'Carrier webhook administrator required'});
  if (req.method !== 'GET') return send(res,405,{error:'GET required'});
  const configured = secret().length >= 32;
  const result = await pool.query(`SELECT kind,provider_event_id,receipt_level,sender,recipient,body,status,status_code,
    media_metadata,occurred_at,received_at FROM flowroute_message_events
    WHERE tenant_id=$1 ORDER BY received_at DESC,id DESC LIMIT 100`,[user.tenant_id]);
  return send(res,200,{configured,urls:configured ? Object.fromEntries(kinds.map(kind=>[kind,origin+pathFor(kind)])) : {},events:result.rows});
}

const phone = value => typeof value === 'string' && /^\+[1-9][0-9]{7,14}$/.test(value);
export async function handleExternalSms({req,res,path,user,pool,send,readJson}) {
  if (path === '/api/external-sms/numbers' && req.method === 'GET') {
    const rows=await pool.query('SELECT number_e164,daily_limit,used_today,usage_day,enabled FROM flowroute_sms_numbers WHERE tenant_id=$1 AND user_id=$2 ORDER BY number_e164',[user.tenant_id,user.id]);
    return send(res,200,{numbers:rows.rows});
  }
  if (path === '/api/external-sms/inbox' && req.method === 'GET') {
    const rows=await pool.query(`SELECT kind,provider_event_id,sender,recipient,body,status,media_metadata,received_at FROM flowroute_message_events
      WHERE tenant_id=$1 AND owner_id=$2 AND kind IN ('sms','mms') ORDER BY received_at DESC LIMIT 100`,[user.tenant_id,user.id]);
    return send(res,200,{messages:rows.rows});
  }
  if (path === '/api/external-sms/sent' && req.method === 'GET') {
    const rows=await pool.query('SELECT id,sender,recipient,body,provider_event_id,status,created_at FROM flowroute_sms_outbound WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100',[user.tenant_id,user.id]);
    return send(res,200,{messages:rows.rows});
  }
  if (path === '/api/external-sms/send' && req.method === 'POST') {
    if (!user.features?.messaging) return send(res,403,{error:'Messaging access required'});
    if (user.tenant_id !== tenant()) return send(res,403,{error:'Carrier account unavailable for tenant'});
    const {from,to,body}=await readJson(req);
    if (!phone(from)||!phone(to)||typeof body!=='string'||body.trim().length<1||body.length>1600)
      return send(res,400,{error:'Valid international numbers and message required (max 1600 characters)'});
    const access=process.env.FLOWROUTE_ACCESS_KEY,secretKey=process.env.FLOWROUTE_SECRET_KEY;
    if (!access||!secretKey) return send(res,503,{error:'Flowroute messaging is not configured'});
    // Atomic allowance prevents concurrent submissions from exceeding an assigned number's daily cap.
    const reserve=await pool.query(`UPDATE flowroute_sms_numbers SET
      used_today=IF(usage_day=UTC_DATE(),used_today+1,1), usage_day=UTC_DATE()
      WHERE number_e164=$1 AND tenant_id=$2 AND user_id=$3 AND enabled=TRUE
      AND IF(usage_day=UTC_DATE(),used_today,0)<daily_limit`,[from,user.tenant_id,user.id]);
    if (!reserve.rowCount) return send(res,403,{error:'Sender unavailable or daily SMS allowance exhausted'});
    const id=randomUUID();
    await pool.query('INSERT INTO flowroute_sms_outbound(id,tenant_id,user_id,sender,recipient,body) VALUES($1,$2,$3,$4,$5,$6)',[id,user.tenant_id,user.id,from,to,body.trim()]);
    try {
      const response=await fetch('https://api.flowroute.com/v2.2/messages',{
        method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${access}:${secretKey}`).toString('base64'),
          'Content-Type':'application/vnd.api+json',Accept:'application/vnd.api+json'},
        body:JSON.stringify({data:{type:'message',attributes:{from,to,body:body.trim()}}}),
        signal:AbortSignal.timeout(10000)});
      if (response.status!==202) {
        await pool.query("UPDATE flowroute_sms_outbound SET status='rejected' WHERE id=$1",[id]);
        return send(res,502,{error:'Carrier rejected the SMS',id});
      }
      const result=await response.json();
      const providerId=result?.data?.id;
      if(typeof providerId!=='string'||!/^mdr2-[\w-]+$/.test(providerId)) throw new Error('Invalid carrier acknowledgement');
      await pool.query("UPDATE flowroute_sms_outbound SET status='accepted',provider_event_id=$1 WHERE id=$2",[providerId,id]);
      return send(res,202,{id,providerId,status:'accepted'});
    } catch(error) {
      await pool.query("UPDATE flowroute_sms_outbound SET status='unknown' WHERE id=$1 AND status='pending'",[id]);
      return send(res,502,{error:'Carrier acceptance is unknown; check sent history before retrying',id});
    }
  }
  return send(res,404,{error:'SMS route unavailable'});
}

export async function handleSmsNumberAdmin({req,res,path,user,pool,send,readJson}) {
  if(!isAdmin(user)||user.tenant_id!==tenant()) return send(res,403,{error:'Carrier administrator required'});
  if(path==='/api/admin/messaging/numbers' && req.method==='GET') {
    const rows=await pool.query('SELECT n.number_e164,n.user_id,u.display_name,n.daily_limit,n.used_today,n.enabled FROM flowroute_sms_numbers n JOIN users u ON u.id=n.user_id WHERE n.tenant_id=$1 ORDER BY n.number_e164',[user.tenant_id]);
    return send(res,200,{numbers:rows.rows});
  }
  if(path==='/api/admin/messaging/numbers' && req.method==='POST') {
    const {number,userId,dailyLimit,enabled}=await readJson(req);
    if(!phone(number)||typeof userId!=='string'||!/^[0-9a-f-]{36}$/i.test(userId)||!Number.isSafeInteger(dailyLimit)||dailyLimit<0||dailyLimit>10000||typeof enabled!=='boolean')
      return send(res,400,{error:'Valid assigned number, user and daily allowance required'});
    const target=await pool.query("SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2 AND status='active'",[userId,user.tenant_id]);
    if(!target.rowCount) return send(res,404,{error:'Active tenant user unavailable'});
    // An administrator must verify Flowroute number ownership and messaging enablement first.
    await pool.query(`INSERT INTO flowroute_sms_numbers(number_e164,tenant_id,user_id,daily_limit,enabled)
      VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE
      user_id=IF(tenant_id=VALUES(tenant_id),VALUES(user_id),user_id),
      daily_limit=IF(tenant_id=VALUES(tenant_id),VALUES(daily_limit),daily_limit),
      enabled=IF(tenant_id=VALUES(tenant_id),VALUES(enabled),enabled)`,[number,user.tenant_id,userId,dailyLimit,enabled]);
    return send(res,200,{number,userId,dailyLimit,enabled});
  }
  return send(res,404,{error:'SMS number route unavailable'});
}
