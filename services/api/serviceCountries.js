import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateLocale} from './locales.js';
import {boundaries} from './countryBoundaries.js';
const rows=JSON.parse(readFileSync(new URL('./countryCatalog.json',import.meta.url),'utf8'));
export const countryCatalog=rows.map(r=>({...r,name:new Intl.DisplayNames(['en'],{type:'region'}).of(r.code)})).sort((a,b)=>a.name.localeCompare(b.name));
const byCode=new Map(rows.map(r=>[r.code,r]));
export function validateCountries(b){
 if(!b||!Array.isArray(b.countries)||!b.countries.length||b.countries.length>249||b.countries.some(c=>!byCode.has(c))||new Set(b.countries).size!==b.countries.length)throw Error('Choose one or more listed service countries');
 const countries=[...b.countries].sort(),all=countries.length===rows.length;
 const primary=b.primaryCountry||(countries.length===1?countries[0]:null);
 if(!countries.includes(primary))throw Error('Select a primary country from your service countries');
 if(!all&&countries.some(c=>!byCode.get(c).boundaryAvailable))throw Error('A selected country has no supported boundary; choose supported countries or Select all');
 const d=byCode.get(primary);let defaults;
 try{defaults=validateLocale({country:primary,language:d.language,currency:d.currency});}catch{defaults=validateLocale({country:primary,language:'en',currency:d.currency});}
 return {countries,primaryCountry:primary,all,defaults};
}
export async function migrateServiceCountries(db){
 for(const sql of [
 `CREATE TABLE IF NOT EXISTS user_location_event_state(user_id CHAR(36) PRIMARY KEY,state VARCHAR(8) NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS user_service_countries(user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,countries JSON NOT NULL,primary_country CHAR(2) NOT NULL,revision INT NOT NULL DEFAULT 1,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS user_service_events(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,actor_id CHAR(36) NULL,event_type VARCHAR(64) NOT NULL,details JSON NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX service_event_user(tenant_id,user_id,id),INDEX service_event_time(created_at)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS user_profile_health(user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,fingerprint CHAR(64) NOT NULL,missing JSON NOT NULL,checked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`
 ])await db.query(sql);
 boundaries(); // Startup fails before readiness if the installed country resource is missing.
}
export async function appendServiceEvent(db,tenant,user,actor,type,details={}){await db.query('INSERT INTO user_service_events(tenant_id,user_id,actor_id,event_type,details) VALUES($1,$2,$3,$4,$5)',[tenant,user,actor,type,JSON.stringify(details)]);}
export async function saveServiceCountries(db,tenant,user,input,actor=user){
 const v=validateCountries(input);
 await db.query('INSERT INTO user_service_countries(user_id,tenant_id,countries,primary_country) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE countries=VALUES(countries),primary_country=VALUES(primary_country),revision=revision+1',[user,tenant,JSON.stringify(v.countries),v.primaryCountry]);
 await db.query('INSERT INTO user_locales(user_id,tenant_id,preferences) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE preferences=VALUES(preferences)',[user,tenant,JSON.stringify(v.defaults)]);
 await appendServiceEvent(db,tenant,user,actor,'service_countries_updated',{countries:v.countries,primaryCountry:v.primaryCountry,defaults:v.defaults});return v;
}
export async function getServiceCountries(db,tenant,user){
 const r=(await db.query('SELECT countries,primary_country,revision FROM user_service_countries WHERE user_id=$1 AND tenant_id=$2',[user,tenant])).rows[0];
 if(!r)return null;const countries=typeof r.countries==='string'?JSON.parse(r.countries):r.countries;
 return {countries,primaryCountry:r.primary_country,revision:r.revision,all:countries.length===rows.length};
}
const fields=['phone_e164','address_line1','city','region','postal_code','country'];
export function profileMissing(p){return fields.filter(k=>!p?.[k]?.trim());}
export async function checkProfileHealth(db,tenant,user){
 const p=(await db.query('SELECT phone_e164,address_line1,address_line2,city,region,postal_code,country FROM user_profiles WHERE user_id=$1',[user])).rows[0]||{};
 const missing=profileMissing(p),fingerprint=createHash('sha256').update(JSON.stringify(fields.map(k=>p[k]||''))).digest('hex');
 const old=(await db.query('SELECT fingerprint FROM user_profile_health WHERE user_id=$1 AND tenant_id=$2 FOR UPDATE',[user,tenant])).rows[0];
 await db.query('INSERT INTO user_profile_health(user_id,tenant_id,fingerprint,missing,checked_at) VALUES($1,$2,$3,$4,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE fingerprint=VALUES(fingerprint),missing=VALUES(missing),checked_at=VALUES(checked_at)',[user,tenant,fingerprint,JSON.stringify(missing)]);
 if(old?.fingerprint!==fingerprint)await appendServiceEvent(db,tenant,user,user,'profile_completeness_changed',{complete:missing.length===0,missing});
 return {profile:p,complete:missing.length===0,missing,checkedAt:new Date().toISOString(),verification:'Completeness check only; identity and phone ownership are not verified'};
}
export function validateBio(b){
 const keys=[...fields,'address_line2'];if(!b||Object.keys(b).some(k=>!keys.includes(k)))throw Error('Unsupported profile field');
 const p=Object.fromEntries(keys.map(k=>[k,typeof b[k]==='string'?b[k].trim():'']));
 if(!/^\+[1-9]\d{7,14}$/.test(p.phone_e164)||profileMissing(p).length||p.address_line1.length>160||p.address_line2.length>160||p.city.length>100||p.region.length>100||p.postal_code.length>32||!byCode.has(p.country))throw Error('Enter a complete profile, E.164 phone and listed country');return p;
}
export async function handleServiceCountries({req,res,path,user,pool,send,readJson}){
 if(path==='/api/service-countries/catalog'&&req.method==='GET')return send(res,200,{countries:countryCatalog});
 if(path.startsWith('/api/account/')){const own=await pool.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2',[user.id,user.tenant_id]);if(!own.rowCount)return send(res,403,{error:'Switch back to your home workspace to manage your profile'});}
 if(path==='/api/account/service-countries'&&req.method==='GET')return send(res,200,{settings:await getServiceCountries(pool,user.tenant_id,user.id)});
 if(path==='/api/account/service-countries'&&req.method==='PUT'){
  let v;try{v=validateCountries(await readJson(req));}catch(e){return send(res,400,{error:e.message});}
  const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[user.id,user.tenant_id]);v=await saveServiceCountries(db,user.tenant_id,user.id,v);await db.query('COMMIT');return send(res,200,v);}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 if(path==='/api/account/biodata'&&['GET','PUT'].includes(req.method)){
  let p;if(req.method==='PUT'){try{p=validateBio(await readJson(req));}catch(e){return send(res,400,{error:e.message});}}
  const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2 FOR UPDATE',[user.id,user.tenant_id]);
   if(p){await db.query('INSERT INTO user_profiles(user_id,phone_e164,address_line1,address_line2,city,region,postal_code,country) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON DUPLICATE KEY UPDATE phone_e164=VALUES(phone_e164),address_line1=VALUES(address_line1),address_line2=VALUES(address_line2),city=VALUES(city),region=VALUES(region),postal_code=VALUES(postal_code),country=VALUES(country)',[user.id,...['phone_e164','address_line1','address_line2','city','region','postal_code','country'].map(k=>p[k])]);await appendServiceEvent(db,user.tenant_id,user.id,user.id,'profile_updated',{fields:Object.keys(p)});}
   const health=await checkProfileHealth(db,user.tenant_id,user.id);await db.query('COMMIT');return send(res,200,health);
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 if(['/api/account/service-events','/api/admin/service-events'].includes(path)&&req.method==='GET'){
  const admin=path.startsWith('/api/admin/');if(admin&&user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  const url=new URL(req.url,'http://localhost'),before=url.searchParams.get('before')||'18446744073709551615';if(!/^\d{1,20}$/.test(before))return send(res,400,{error:'Invalid event cursor'});
  const args=[user.tenant_id,before];if(!admin)args.push(user.id);
  const events=(await pool.query('SELECT id,user_id,actor_id,event_type,details,created_at FROM user_service_events WHERE tenant_id=$1 AND id<$2'+(!admin?' AND user_id=$3':'')+' ORDER BY id DESC LIMIT 50',args)).rows;
  return send(res,200,{events,nextBefore:events.length===50?String(events.at(-1).id):null});
 }return send(res,404,{error:'Location profile route unavailable'});
}
export function startProfileTracker(pool){let last='',busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{const users=(await pool.query("SELECT id,tenant_id FROM users WHERE status='active' AND id>$1 ORDER BY id LIMIT 100",[last])).rows;if(!users.length){last='';return;}for(const u of users){const db=await pool.connect();try{await db.query('START TRANSACTION');await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id]);await checkProfileHealth(db,u.tenant_id,u.id);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}last=u.id;}}catch(e){console.error('Profile tracker failed',e.code||e.name);}finally{busy=false;}},60000);timer.unref();return ()=>clearInterval(timer);}
