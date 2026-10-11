import {createHash,timingSafeEqual} from 'node:crypto';
import {selectQuote} from './operatorControl.js';
import {evaluateOutboundPolicy} from './pbx.js';

const e164=/^\+[1-9]\d{7,14}$/;
const userPattern=/^[a-z0-9]{2,64}$/i;
const domainPattern=/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i;
const gatewayPattern=/^[a-z][a-z0-9_-]{1,63}$/;
const extensionPattern=/^\d{2,10}$/;
function authorized(req){
  const secret=process.env.KAMAILIO_ROUTE_TOKEN||'';
  if(Buffer.byteLength(secret)<32)return false;
  const supplied=(req.headers.authorization||'').replace(/^Bearer /,'');
  const a=Buffer.from(supplied),b=Buffer.from(secret);
  return a.length===b.length&&timingSafeEqual(a,b);
}
function reply(res,status,data){
  res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}
async function input(req){
  if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('JSON required');
  let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)throw new Error('Request too large');}
  return JSON.parse(body);
}
export function digestHa1(username,domain,password){
  if(!userPattern.test(username)||!domainPattern.test(domain)||!password)throw new RangeError('Invalid SIP credential');
  return createHash('md5').update(username+':'+domain+':'+password).digest('hex');
}
export async function migrateKamailio(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS kamailio_credentials (
    account_id CHAR(36) PRIMARY KEY,username VARCHAR(64) NOT NULL,domain VARCHAR(255) NOT NULL,
    ha1 CHAR(32) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY realm_user(domain,username),FOREIGN KEY(account_id) REFERENCES sip_accounts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE OR REPLACE VIEW kamailio_active_subscribers AS
    SELECT c.username,c.domain,c.ha1
    FROM kamailio_credentials c JOIN sip_accounts a ON a.id=c.account_id AND a.status='active'
    JOIN users u ON u.id=a.user_id AND u.status='active'
    JOIN tenants n ON n.id=a.tenant_id AND n.status='active'
    JOIN switch_tenants t ON t.tenant_id=a.tenant_id AND t.domain=a.domain AND t.enabled=TRUE`);
}
export async function syncKamailioCredential(pool,{accountId,username,domain,password}){
  const ha1=digestHa1(username,domain,password);
  await pool.query(`INSERT INTO kamailio_credentials(account_id,username,domain,ha1) VALUES($1,$2,$3,$4)
    ON DUPLICATE KEY UPDATE username=VALUES(username),domain=VALUES(domain),ha1=VALUES(ha1)`,
    [accountId,username,domain,ha1]);
}
export async function handleKamailioAuth({req,res,pool}){
  if(req.method!=='POST'||!authorized(req))return reply(res,401,{error:'Unauthorized'});
  let b;try{b=await input(req);}catch{return reply(res,400,{error:'Invalid request'});}
  const {domain,username}=b||{};
  if(!domainPattern.test(domain||'')||!userPattern.test(username||''))
    return reply(res,400,{error:'Invalid account'});
  const found=await pool.query('SELECT ha1 FROM kamailio_active_subscribers WHERE domain=$1 AND username=$2 LIMIT 1',
    [domain,username]);
  if(!found.rowCount)return reply(res,404,{error:'Account unavailable'});
  return reply(res,200,{ha1:found.rows[0].ha1});
}
export async function handleKamailioRoute({req,res,pool}){
  if(req.method!=='POST'||!authorized(req))return reply(res,401,{error:'Unauthorized'});
  let b;try{b=await input(req);}catch{return reply(res,400,{error:'Invalid request'});}
  const {domain,caller,destination}=b||{};
  if(!domainPattern.test(domain||'')||!userPattern.test(caller||'')||
      !(extensionPattern.test(destination||'')||e164.test(destination||'')))
    return reply(res,400,{error:'Invalid route request'});
  const cfg=await pool.query(`SELECT t.tenant_id,t.tariff_id,a.user_id
    FROM switch_tenants t JOIN tenants n ON n.id=t.tenant_id AND n.status='active'
    JOIN sip_accounts a ON a.tenant_id=t.tenant_id AND a.domain=t.domain AND a.username=$2 AND a.status='active'
    JOIN users u ON u.id=a.user_id AND u.status='active'
    WHERE t.domain=$1 AND t.enabled=TRUE LIMIT 1`,[domain,caller]);
  if(!cfg.rowCount)return reply(res,404,{route:'reject'});
  const {tenant_id:tenant,tariff_id:tariff,user_id:userId}=cfg.rows[0];
  if(extensionPattern.test(destination)){
    const target=await pool.query(`SELECT s.username FROM pbx_destinations d
      JOIN pbx_extensions e ON e.destination_id=d.id
      JOIN sip_accounts s ON s.user_id=e.user_id AND s.tenant_id=d.tenant_id AND s.status='active'
      WHERE d.tenant_id=$1 AND d.number=$2 AND d.enabled=TRUE AND s.domain=$3 LIMIT 1`,
      [tenant,destination,domain]);
    return target.rowCount?reply(res,200,{route:'extension',username:target.rows[0].username,domain}):
      reply(res,404,{route:'reject'});
  }
  if(!tariff)return reply(res,404,{route:'reject'});
  const [policy,rates,blocks,carriers]=await Promise.all([
    pool.query('SELECT prefix,action FROM pbx_outbound_policies WHERE tenant_id=$1',[tenant]),
    pool.query(`SELECT r.id,r.provider,r.prefix,r.cost_cents,r.price_cents,r.priority,r.effective_at,
      r.expires_at,r.enabled,t.mode FROM operator_tariff_rates r JOIN operator_tariffs t
      ON t.id=r.tariff_id AND t.tenant_id=r.tenant_id AND t.enabled=TRUE
      WHERE r.tenant_id=$1 AND r.tariff_id=$2 AND r.enabled=TRUE`,[tenant,tariff]),
    pool.query('SELECT prefix,reason,enabled FROM operator_fraud_rules WHERE tenant_id=$1 AND enabled=TRUE',[tenant]),
    pool.query(`SELECT c.provider,c.status,c.routing_mode,g.gateway_name,
      tr.host,tr.port,tr.transport
      FROM carrier_provider_profiles c JOIN switch_gateways g ON g.provider=c.provider
      AND g.tenant_id=c.tenant_id AND g.enabled=TRUE
      JOIN pbx_trunks tr ON tr.id=c.trunk_id AND tr.tenant_id=c.tenant_id AND tr.enabled=TRUE
      WHERE c.tenant_id=$1 AND c.status='active' AND c.routing_mode<>'disabled'`,[tenant])]);
  if(!evaluateOutboundPolicy(destination,policy.rows).allowed)return reply(res,404,{route:'reject'});
  const normalized=rates.rows.map(row=>({...row,effective_at:new Date(row.effective_at).toISOString(),
    expires_at:row.expires_at?new Date(row.expires_at).toISOString():null}));
  const quote=selectQuote({number:destination,at:Date.now(),mode:rates.rows[0]?.mode||'least_cost',
    rates:normalized,blocks:blocks.rows,carriers:carriers.rows});
  if(quote.blocked||!quote.selected)return reply(res,404,{route:'reject'});
  const ranked=[];
  for(const candidate of quote.candidates){
    const carrier=carriers.rows.find(row=>row.provider===candidate.provider);
    const {gateway_name:gateway,host,port,transport}=carrier||{};
    if(!gatewayPattern.test(gateway||'')||!domainPattern.test(host||'')||
        !Number.isInteger(Number(port))||Number(port)<1||Number(port)>65535||
        !['udp','tcp','tls'].includes(transport)||ranked.some(row=>row.provider===candidate.provider))continue;
    ranked.push({provider:candidate.provider,gateway,host,port:Number(port),transport,rateId:candidate.id});
    if(ranked.length===4)break;
  }
  if(!ranked.length)return reply(res,404,{route:'reject'});
  return reply(res,200,{route:'carrier',gateway:ranked[0].gateway,
    host:ranked[0].host,port:ranked[0].port,transport:ranked[0].transport,
    destination,provider:ranked[0].provider,alternates:ranked.slice(1),
    prepaid:{tenantId:tenant,userId,rateId:ranked[0].rateId,required:true}});
}
