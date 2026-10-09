import {randomBytes,timingSafeEqual,createDecipheriv,createCipheriv} from 'node:crypto';
import {isAdmin} from './tenancy.js';
import {selectQuote} from './operatorControl.js';
import {evaluateOutboundPolicy} from './pbx.js';
import {syncKamailioCredential} from './kamailio.js';

const domainPattern=/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;
const gatewayPattern=/^[a-z][a-z0-9_-]{1,63}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const e164=/^\+[1-9]\d{7,14}$/;
const xml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const notFound='<?xml version="1.0" encoding="UTF-8"?><document type="freeswitch/xml"><section name="result"><result status="not found"/></section></document>';
function xmlReply(res,body){res.writeHead(200,{'Content-Type':'text/xml; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);}
function authorized(req){
  const secret=process.env.FREESWITCH_XML_PASSWORD;
  if(!secret||Buffer.byteLength(secret)<32)return false;
  const value=req.headers.authorization||'';
  if(!value.startsWith('Basic '))return false;
  let decoded;try{decoded=Buffer.from(value.slice(6),'base64').toString('utf8');}catch{return false;}
  const expected=Buffer.from('olamide:'+secret),actual=Buffer.from(decoded);
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function credentialKey(){
  const value=process.env.SIP_CREDENTIAL_KEY;
  return /^[0-9a-f]{64}$/i.test(value||'')?Buffer.from(value,'hex'):null;
}
function decrypt(value,key){
  const data=Buffer.from(value),cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
  cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString('utf8');
}
function encrypt(value,key){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);
}
async function form(req){
  if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))throw new RangeError('Form required');
  let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)throw new RangeError('Request too large');}
  return new URLSearchParams(body);
}
function directory({domain,username,password,context}){
  return `<?xml version="1.0" encoding="UTF-8"?><document type="freeswitch/xml"><section name="directory"><domain name="${xml(domain)}"><params/><variables/><groups><group name="default"><users><user id="${xml(username)}"><params><param name="password" value="${xml(password)}"/></params><variables><variable name="user_context" value="${xml(context)}"/></variables></user></users></group></groups></domain></section></document>`;
}
function dialplan(context,destination,bridge){
  const expression=destination.startsWith('+')?'\\+'+destination.slice(1):destination;
  return `<?xml version="1.0" encoding="UTF-8"?><document type="freeswitch/xml"><section name="dialplan"><context name="${xml(context)}"><extension name="olamide-route"><condition field="destination_number" expression="^${xml(expression)}$"><action application="set" data="hangup_after_bridge=true"/><action application="bridge" data="${xml(bridge)}"/></condition></extension></context></section></document>`;
}
export async function migrateSwitch(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS switch_tenants (
    tenant_id CHAR(36) PRIMARY KEY, domain VARCHAR(255) NOT NULL UNIQUE,
    tariff_id CHAR(36) NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(tariff_id) REFERENCES operator_tariffs(id),
    FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS switch_gateways (
    tenant_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,gateway_name VARCHAR(64) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY(tenant_id,provider),UNIQUE KEY gateway_owner(gateway_name),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  ) ENGINE=InnoDB`);
}
export async function handleSwitchAdmin({req,res,path,user,pool,send,readJson}){
  if(!isAdmin(user))return send(res,403,{error:'Administrator required'});
  const tenant=user.tenant_id;
  if(path==='/api/admin/switch'&&req.method==='GET'){
    const [config,gateways,accounts]=await Promise.all([
      pool.query('SELECT domain,tariff_id,enabled,updated_at FROM switch_tenants WHERE tenant_id=$1',[tenant]),
      pool.query('SELECT provider,gateway_name,enabled FROM switch_gateways WHERE tenant_id=$1 ORDER BY provider',[tenant]),
      pool.query("SELECT COUNT(*) AS total,COALESCE(SUM(status='active'),0) AS active FROM sip_accounts WHERE tenant_id=$1",[tenant])]);
    return send(res,200,{configured:!!process.env.FREESWITCH_XML_PASSWORD&&!!credentialKey(),
      config:config.rows[0]||null,gateways:gateways.rows,accounts:accounts.rows[0]});
  }
  if(path==='/api/admin/switch/kamailio/readiness'&&req.method==='GET'){
    const [configuration,accounts,credentials,carriers]=await Promise.all([
      pool.query('SELECT domain,enabled,tariff_id FROM switch_tenants WHERE tenant_id=$1',[tenant]),
      pool.query("SELECT COUNT(*) AS total FROM sip_accounts WHERE tenant_id=$1 AND status='active'",[tenant]),
      pool.query(`SELECT COUNT(*) AS total FROM kamailio_credentials c
        JOIN sip_accounts a ON a.id=c.account_id
        WHERE a.tenant_id=$1 AND a.status='active'`,[tenant]),
      pool.query(`SELECT COUNT(*) AS total FROM carrier_provider_profiles p
        JOIN switch_gateways g ON g.tenant_id=p.tenant_id AND g.provider=p.provider
        WHERE p.tenant_id=$1 AND p.status='active' AND p.routing_mode<>'disabled'
          AND g.enabled=TRUE`,[tenant])
    ]);
    const config=configuration.rows[0]||null;
    const active=Number(accounts.rows[0]?.total||0);
    const synced=Number(credentials.rows[0]?.total||0);
    const enabledCarriers=Number(carriers.rows[0]?.total||0);
    const blockers=[];
    if(!config?.enabled)blockers.push('Tenant switch lookup is disabled');
    if(!credentialKey())blockers.push('SIP credential encryption key is unavailable');
    if(Buffer.byteLength(process.env.KAMAILIO_ROUTE_TOKEN||'')<32)
      blockers.push('Kamailio API token is unavailable');
    if(!active)blockers.push('No active SIP accounts');
    if(synced<active)blockers.push('Some active SIP accounts lack Kamailio digest credentials');
    if(!enabledCarriers)blockers.push('No commissioned carrier gateway mappings');
    blockers.push('Live SIP, media, charging and failover tests are still required');
    return send(res,200,{domain:config?.domain||null,activeAccounts:active,
      syncedCredentials:synced,enabledCarriers,blockers,productionReady:false});
  }
  if(path==='/api/admin/switch/accounts'&&req.method==='GET'){
    const found=await pool.query('SELECT user_id,username,domain,status FROM sip_accounts WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200',[tenant]);
    return send(res,200,{accounts:found.rows});
  }
  if(path==='/api/admin/switch'&&req.method==='PUT'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const b=await readJson(req);
    if(!domainPattern.test(b.domain||'')||typeof b.enabled!=='boolean'||b.tariffId!==null&&!uuid.test(b.tariffId||''))
      return send(res,400,{error:'Valid switch domain, tariff and enabled state required'});
    if(b.enabled&&(!process.env.FREESWITCH_XML_PASSWORD||!credentialKey()))
      return send(res,409,{error:'Switch XML password and SIP credential key required'});
    if(b.tariffId){
      const found=await pool.query('SELECT id FROM operator_tariffs WHERE id=$1 AND tenant_id=$2',[b.tariffId,tenant]);
      if(!found.rowCount)return send(res,404,{error:'Tariff unavailable'});
    }
    if(b.enabled){
      const accounts=await pool.query("SELECT 1 FROM sip_accounts WHERE tenant_id=$1 AND domain<>$2 AND status='active' LIMIT 1",[tenant,b.domain]);
      if(accounts.rowCount)return send(res,409,{error:'Active SIP account domain differs from switch domain'});
    }
    try{await pool.query('INSERT INTO switch_tenants(tenant_id,domain,tariff_id,enabled,updated_by) VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE domain=VALUES(domain),tariff_id=VALUES(tariff_id),enabled=VALUES(enabled),updated_by=VALUES(updated_by)',
      [tenant,b.domain.toLowerCase(),b.tariffId,b.enabled,user.id]);}
    catch(error){if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Domain assigned to another tenant'});throw error;}
    return send(res,200,{domain:b.domain.toLowerCase(),enabled:b.enabled});
  }
  if(path==='/api/admin/switch/gateways'&&req.method==='PUT'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const b=await readJson(req);
    if(!gatewayPattern.test(b.gatewayName||'')||typeof b.enabled!=='boolean')
      return send(res,400,{error:'Valid gateway name and enabled state required'});
    const carrier=await pool.query('SELECT provider FROM carrier_provider_profiles WHERE tenant_id=$1 AND provider=$2',[tenant,b.provider]);
    if(!carrier.rowCount)return send(res,404,{error:'Carrier profile unavailable'});
    try{await pool.query('INSERT INTO switch_gateways(tenant_id,provider,gateway_name,enabled) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE gateway_name=VALUES(gateway_name),enabled=VALUES(enabled)',
      [tenant,b.provider,b.gatewayName,b.enabled]);}
    catch(error){if(error.code==='ER_DUP_ENTRY')return send(res,409,{error:'Gateway name belongs to another carrier'});throw error;}
    return send(res,200,{provider:b.provider,gatewayName:b.gatewayName,enabled:b.enabled});
  }
  if(path==='/api/admin/switch/activate'&&req.method==='POST'){
    if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
    const b=await readJson(req);
    if(!uuid.test(b.userId||''))return send(res,400,{error:'Valid user ID required'});
    const key=credentialKey();
    if(!key||!process.env.FREESWITCH_XML_PASSWORD)return send(res,409,{error:'Switch credentials unavailable'});
    const cfg=await pool.query('SELECT domain FROM switch_tenants WHERE tenant_id=$1 AND enabled=TRUE',[tenant]);
    if(!cfg.rowCount)return send(res,409,{error:'Enable tenant switch first'});
    const found=await pool.query("SELECT id,username,domain,secret_cipher,status FROM sip_accounts WHERE user_id=$1 AND tenant_id=$2",[b.userId,tenant]);
    if(!found.rowCount||found.rows[0].domain!==cfg.rows[0].domain)return send(res,409,{error:'SIP account domain does not match switch'});
    const password=found.rows[0].secret_cipher?decrypt(found.rows[0].secret_cipher,key):randomBytes(32).toString('base64url');
    const generated=found.rows[0].secret_cipher?null:encrypt(password,key);
    await pool.query("UPDATE sip_accounts SET status='active',secret_cipher=COALESCE(secret_cipher,$3) WHERE id=$1 AND tenant_id=$2",
      [found.rows[0].id,tenant,generated]);
    await syncKamailioCredential(pool,{accountId:found.rows[0].id,username:found.rows[0].username,
      domain:found.rows[0].domain,password});
    return send(res,200,{userId:b.userId,status:'active'});
  }
  return send(res,404,{error:'Switch route unavailable'});
}
export async function handleSwitchXml({req,res,pool}){
  if(req.method!=='POST'||!authorized(req)){res.writeHead(401,{'Cache-Control':'no-store'});return res.end();}
  let params;try{params=await form(req);}catch{res.writeHead(400);return res.end();}
  const section=params.get('section');
  if(section==='directory'){
    const domain=params.get('domain')||params.get('key_value');
    const username=params.get('user')||params.get('key_value');
    if(!domainPattern.test(domain||'')||!/^[a-z0-9]{2,64}$/i.test(username||''))return xmlReply(res,notFound);
    const rows=await pool.query("SELECT s.username,s.secret_cipher,t.domain,t.tenant_id FROM sip_accounts s JOIN switch_tenants t ON t.tenant_id=s.tenant_id AND t.domain=s.domain AND t.enabled=TRUE JOIN tenants n ON n.id=t.tenant_id AND n.status='active' JOIN users u ON u.id=s.user_id AND u.status='active' WHERE s.username=$1 AND s.domain=$2 AND s.status='active'",[username,domain]);
    const account=rows.rows[0],key=credentialKey();
    if(!account?.secret_cipher||!key)return xmlReply(res,notFound);
    return xmlReply(res,directory({domain:account.domain,username:account.username,
      password:decrypt(account.secret_cipher,key),context:'ol_'+account.tenant_id.replaceAll('-','')}));
  }
  if(section!=='dialplan')return xmlReply(res,notFound);
  const context=params.get('Caller-Context')||params.get('context')||params.get('key_value');
  const match=/^ol_([0-9a-f]{32})$/i.exec(context||'');
  const caller=params.get('sip_auth_username')||params.get('variable_sip_auth_username');
  const destination=params.get('Caller-Destination-Number')||params.get('destination_number');
  if(!match||!/^[a-z0-9]{2,64}$/i.test(caller||'')||!(/^\d{2,10}$/.test(destination||'')||e164.test(destination||'')))return xmlReply(res,notFound);
  const tenant=[match[1].slice(0,8),match[1].slice(8,12),match[1].slice(12,16),match[1].slice(16,20),match[1].slice(20)].join('-');
  const cfg=await pool.query("SELECT t.domain,t.tariff_id FROM switch_tenants t JOIN tenants n ON n.id=t.tenant_id AND n.status='active' JOIN sip_accounts s ON s.tenant_id=t.tenant_id AND s.domain=t.domain AND s.username=$2 AND s.status='active' JOIN users u ON u.id=s.user_id AND u.status='active' WHERE t.tenant_id=$1 AND t.enabled=TRUE",[tenant,caller]);
  if(!cfg.rowCount)return xmlReply(res,notFound);
  const domain=cfg.rows[0].domain;
  if(/^\d{2,10}$/.test(destination)){
    const target=await pool.query("SELECT s.username FROM pbx_destinations d JOIN pbx_extensions e ON e.destination_id=d.id JOIN sip_accounts s ON s.user_id=e.user_id AND s.tenant_id=d.tenant_id AND s.status='active' WHERE d.tenant_id=$1 AND d.number=$2 AND d.enabled=TRUE AND s.domain=$3",[tenant,destination,domain]);
    if(!target.rowCount)return xmlReply(res,notFound);
    return xmlReply(res,dialplan(context,destination,`user/${target.rows[0].username}@${domain}`));
  }
  const [policy,rates,blocks,carriers]=await Promise.all([
    pool.query('SELECT prefix,action FROM pbx_outbound_policies WHERE tenant_id=$1',[tenant]),
    pool.query('SELECT r.provider,r.prefix,r.cost_cents,r.price_cents,r.priority,r.effective_at,r.expires_at,r.enabled,t.mode FROM operator_tariff_rates r JOIN operator_tariffs t ON t.id=r.tariff_id AND t.tenant_id=r.tenant_id AND t.enabled=TRUE WHERE r.tenant_id=$1 AND r.tariff_id=$2 AND r.enabled=TRUE',[tenant,cfg.rows[0].tariff_id]),
    pool.query('SELECT prefix,reason,enabled FROM operator_fraud_rules WHERE tenant_id=$1 AND enabled=TRUE',[tenant]),
    pool.query("SELECT c.provider,c.status,c.routing_mode,g.gateway_name FROM carrier_provider_profiles c JOIN switch_gateways g ON g.provider=c.provider AND g.tenant_id=c.tenant_id AND g.enabled=TRUE WHERE c.tenant_id=$1",[tenant])]);
  if(!evaluateOutboundPolicy(destination,policy.rows).allowed)return xmlReply(res,notFound);
  const normalized=rates.rows.map(row=>({...row,effective_at:new Date(row.effective_at).toISOString(),expires_at:row.expires_at?new Date(row.expires_at).toISOString():null}));
  const quote=selectQuote({number:destination,at:Date.now(),mode:rates.rows[0]?.mode||'least_cost',
    rates:normalized,blocks:blocks.rows,carriers:carriers.rows});
  if(quote.blocked||!quote.selected)return xmlReply(res,notFound);
  const gateway=carriers.rows.find(row=>row.provider===quote.selected.provider)?.gateway_name;
  if(!gateway||!gatewayPattern.test(gateway))return xmlReply(res,notFound);
  return xmlReply(res,dialplan(context,destination,`sofia/gateway/${gateway}/${destination.slice(1)}`));
}
