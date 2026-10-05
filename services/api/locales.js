import {isAdmin} from "./tenancy.js";

const names=(type)=>new Intl.DisplayNames(["en"],{type});
const languageName=names("language"),regionName=names("region"),currencyName=names("currency");
const alpha="abcdefghijklmnopqrstuvwxyz";
// ISO 3166 alpha-2 codes from the public-domain tzdata iso3166.tab.
const countryCodes=`AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ");
const codes=(alphabet,length)=>length===1?[...alphabet]:codes(alphabet,length-1).flatMap(prefix=>[...alphabet].map(ch=>prefix+ch));
const catalog={
  languages:[...new Set([...codes(alpha,2),...codes(alpha,3)])].filter(code=>languageName.of(code)!==code)
    .map(code=>({code,name:languageName.of(code)})).sort((a,b)=>a.name.localeCompare(b.name,"en")),
  countries:countryCodes.filter(code=>regionName.of(code)!==code)
    .map(code=>({code,name:regionName.of(code)})).sort((a,b)=>a.name.localeCompare(b.name,"en")),
  currencies:Intl.supportedValuesOf("currency").map(code=>({code,name:currencyName.of(code)}))
    .sort((a,b)=>a.name.localeCompare(b.name,"en"))
};
const lookup=Object.fromEntries(Object.entries(catalog).map(([key,items])=>[key,new Set(items.map(item=>item.code))]));
export const DEFAULT_LOCALE=Object.freeze({language:"en",country:"US",currency:"USD"});
export function validateLocale(data) {
  if(!data || typeof data!=="object" || Array.isArray(data) ||
     Object.keys(data).some(key=>!["language","country","currency"].includes(key)) ||
     !lookup.languages.has(data.language) || !lookup.countries.has(data.country) || !lookup.currencies.has(data.currency))
    throw new TypeError("Choose a listed language, country, and currency");
  return {language:data.language,country:data.country,currency:data.currency};
}
function decode(value) {
  try{return validateLocale(typeof value==="string"?JSON.parse(value):value);}catch{return DEFAULT_LOCALE;}
}
export async function migrateLocales(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS tenant_locales (
    tenant_id CHAR(36) PRIMARY KEY,preferences JSON NOT NULL,updated_by CHAR(36) NOT NULL,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_locales (
    user_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,preferences JSON NOT NULL,
    PRIMARY KEY(user_id,tenant_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB`);
}
export async function handleLocales({req,res,path,user,pool,send,readJson}) {
  if(path==="/api/locales/catalog" && req.method==="GET") return send(res,200,{...catalog,
    note:"Locale preferences do not translate the interface or convert billed amounts"});
  if(path==="/api/admin/locales" && !isAdmin(user)) return send(res,403,{error:"Administrator required"});
  if(path==="/api/locales" && req.method==="GET") {
    const [tenant,personal]=await Promise.all([
      pool.query("SELECT preferences FROM tenant_locales WHERE tenant_id=$1",[user.tenant_id]),
      pool.query("SELECT preferences FROM user_locales WHERE user_id=$1 AND tenant_id=$2",[user.id,user.tenant_id])]);
    const defaults=decode(tenant.rows[0]?.preferences),mine=personal.rows[0]?decode(personal.rows[0].preferences):null;
    return send(res,200,{tenant:defaults,personal:mine,effective:mine??defaults});
  }
  if(path==="/api/locales" && req.method==="PUT") {
    let preference;
    try{preference=validateLocale(await readJson(req));}catch{return send(res,400,{error:"Invalid locale preference"});}
    await pool.query("INSERT INTO user_locales(user_id,tenant_id,preferences) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE preferences=VALUES(preferences)",
      [user.id,user.tenant_id,JSON.stringify(preference)]);
    return send(res,200,{effective:preference});
  }
  if(path==="/api/locales" && req.method==="DELETE") {
    await pool.query("DELETE FROM user_locales WHERE user_id=$1 AND tenant_id=$2",[user.id,user.tenant_id]);
    return send(res,200,{status:"reset"});
  }
  if(path==="/api/admin/locales" && req.method==="PUT") {
    let preference;
    try{preference=validateLocale(await readJson(req));}catch{return send(res,400,{error:"Invalid locale preference"});}
    await pool.query("INSERT INTO tenant_locales(tenant_id,preferences,updated_by) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE preferences=VALUES(preferences),updated_by=VALUES(updated_by)",
      [user.tenant_id,JSON.stringify(preference),user.id]);
    return send(res,200,{tenant:preference});
  }
  return send(res,404,{error:"Locale route unavailable"});
}
