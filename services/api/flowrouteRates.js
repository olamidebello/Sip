import { randomUUID, createHash } from 'node:crypto';
import { isAdmin } from './tenancy.js';

const header=['Destination','Prefix','First Interval','Sub Interval','Default','Interstate Rate','Intrastate Rate','Status','Start Date'];
const money=/^(0|[1-9]\d{0,5})(?:\.(\d{1,6}))?$/;
const cents6=value=>{
  const match=money.exec(value);
  if(!match) throw new Error('Invalid carrier rate');
  return BigInt(match[1])*1000000n+BigInt((match[2]||'').padEnd(6,'0'));
};
const decimal=value=>`${value/1000000n}.${String(value%1000000n).padStart(6,'0')}`;
export function markedRate(rate){return decimal((cents6(rate)*130n+50n)/100n);}

export function parseCsv(csv){
  if(typeof csv!=='string'||csv.length>20*1024*1024) throw new Error('Rate file too large');
  csv=csv.replace(/^\uFEFF/,'');
  const records=[],row=[];let field='',quoted=false;
  for(let i=0;i<csv.length;i++){
    const ch=csv[i];
    if(quoted){if(ch==='"'&&csv[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
    else if(ch==='"'){if(field)throw new Error('Invalid CSV quote');quoted=true;}
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'){row.push(field.replace(/\r$/,''));field='';if(row.some(Boolean))records.push(row.splice(0));else row.length=0;}
    else field+=ch;
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  if(field||row.length){row.push(field.replace(/\r$/,''));records.push(row);}
  if(!records.length||records[0].join('|')!==header.join('|'))throw new Error('Unexpected Flowroute rate columns');
  records.shift();
  if(!records.length||records.length>150000)throw new Error('Expected 1–150000 rate rows');
  const prefixes=new Set();
  return records.map((r,index)=>{
    if(r.length!==9||!r[0]||r[0].length>160||!/^\d{1,15}$/.test(r[1])||prefixes.has(r[1])||r[7]!=='Current')
      throw new Error(`Invalid or duplicate prefix at row ${index+2}`);
    prefixes.add(r[1]);
    const first=Number(r[2]),sub=Number(r[3]);
    if(!Number.isInteger(first)||first<1||first>3600||!Number.isInteger(sub)||sub<1||sub>3600)
      throw new Error(`Invalid interval at row ${index+2}`);
    const cost=cents6(r[4]);
    if(cents6(r[5])!==cost||cents6(r[6])!==cost)throw new Error(`Differing cost categories at row ${index+2}`);
    if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r[8]))throw new Error(`Invalid date at row ${index+2}`);
    return {destination:r[0],prefix:r[1],first,sub,cost:decimal(cost),price:markedRate(r[4]),effective:r[8]};
  });
}

export async function migrateFlowrouteRates(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_rate_decks (
    id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, provider VARCHAR(24) NOT NULL,
    source_sha256 CHAR(64) NOT NULL, row_count INT UNSIGNED NOT NULL, markup_bps INT UNSIGNED NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE, imported_by CHAR(36) NOT NULL,
    imported_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX carrier_rate_active (tenant_id,provider,active),
    UNIQUE KEY carrier_rate_source (tenant_id,provider,source_sha256),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id), FOREIGN KEY (imported_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS carrier_rate_rows (
    deck_id CHAR(36) NOT NULL, prefix VARCHAR(15) NOT NULL,destination VARCHAR(160) NOT NULL,
    first_interval SMALLINT UNSIGNED NOT NULL,sub_interval SMALLINT UNSIGNED NOT NULL,
    cost_usd_per_minute DECIMAL(12,6) NOT NULL,price_usd_per_minute DECIMAL(12,6) NOT NULL,
    effective_at DATETIME NOT NULL,PRIMARY KEY(deck_id,prefix),
    FOREIGN KEY (deck_id) REFERENCES carrier_rate_decks(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}

async function readCsv(req){
  if(!/^text\/csv(?:\s*;|\s*$)/i.test(req.headers['content-type']||''))throw new Error('CSV content type required');
  const parts=[];let size=0;
  for await(const part of req){size+=part.length;if(size>20*1024*1024)throw new Error('Rate file too large');parts.push(part);}
  return Buffer.concat(parts).toString('utf8');
}
export async function handleFlowrouteRates({req,res,path,user,pool,send}){
  if(path==='/api/rates/flowroute/search'&&req.method==='GET'){
    const query=new URL(req.url,'http://localhost').searchParams.get('prefix')||'';
    if(!/^\d{1,15}$/.test(query))return send(res,400,{error:'Enter destination digits'});
    const rows=await pool.query(`SELECT r.prefix,r.destination,r.price_usd_per_minute,r.first_interval,r.sub_interval
      FROM carrier_rate_rows r JOIN carrier_rate_decks d ON d.id=r.deck_id
      WHERE d.tenant_id=$1 AND d.provider='flowroute' AND d.active=TRUE AND $2 LIKE CONCAT(r.prefix,'%')
      ORDER BY CHAR_LENGTH(r.prefix) DESC LIMIT 1`,[user.tenant_id,query]);
    return send(res,200,{rate:rows.rows[0]||null,currency:'USD',unit:'minute',quoteOnly:true});
  }
  if(!isAdmin(user))return send(res,403,{error:'Administrator required'});
  if(path==='/api/admin/rates/flowroute'&&req.method==='GET'){
    const rows=await pool.query("SELECT id,row_count,markup_bps,source_sha256,active,imported_at FROM carrier_rate_decks WHERE tenant_id=$1 AND provider='flowroute' ORDER BY imported_at DESC LIMIT 20",[user.tenant_id]);
    return send(res,200,{decks:rows.rows,switchProvisioned:false});
  }
  if(path==='/api/admin/rates/flowroute/import'&&req.method==='POST'){
    let csv,rows;
    try{csv=await readCsv(req);rows=parseCsv(csv);}catch(error){return send(res,400,{error:error.message});}
    const sha=createHash('sha256').update(csv).digest('hex');
    const existing=await pool.query("SELECT id,active FROM carrier_rate_decks WHERE tenant_id=$1 AND provider='flowroute' AND source_sha256=$2",[user.tenant_id,sha]);
    if(existing.rowCount)return send(res,200,{id:existing.rows[0].id,count:rows.length,active:!!existing.rows[0].active,unchanged:true});
    const id=randomUUID(),db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query("INSERT INTO carrier_rate_decks(id,tenant_id,provider,source_sha256,row_count,markup_bps,imported_by) VALUES($1,$2,'flowroute',$3,$4,3000,$5)",[id,user.tenant_id,sha,rows.length,user.id]);
      for(let i=0;i<rows.length;i+=200){
        const batch=rows.slice(i,i+200),params=[];
        const values=batch.map(r=>{
          const offset=params.length;params.push(id,r.prefix,r.destination,r.first,r.sub,r.cost,r.price,r.effective);
          return '('+Array.from({length:8},(_,j)=>'$'+(offset+j+1)).join(',')+')';
        }).join(',');
        await db.query(`INSERT INTO carrier_rate_rows(deck_id,prefix,destination,first_interval,sub_interval,cost_usd_per_minute,price_usd_per_minute,effective_at) VALUES ${values}`,params);
      }
      await db.query("UPDATE carrier_rate_decks SET active=FALSE WHERE tenant_id=$1 AND provider='flowroute' AND active=TRUE",[user.tenant_id]);
      await db.query('UPDATE carrier_rate_decks SET active=TRUE WHERE id=$1',[id]);
      await db.query('COMMIT');
      return send(res,201,{id,count:rows.length,markupPercent:30,active:true,switchProvisioned:false,sha256:sha});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  return send(res,404,{error:'Rate route unavailable'});
}
