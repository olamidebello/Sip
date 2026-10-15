import {randomUUID} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field=(name,type,label,extra={})=>({name,type,label,...extra});
export const policyDefinitions={
 'group-assignments':{feature:'core-rate-groups',label:'Assign workspace user to rate group',fields:[field('userId','text','Workspace user ID'),field('groupId','text','Rate group ID')]},
 'group-rates':{feature:'core-rate-groups',label:'Live rate group destination rate',fields:[field('groupId','text','Rate group ID'),field('prefix','text','Destination prefix'),field('rate','text','USD per minute'),field('first','number','First interval seconds'),field('step','number','Next interval seconds')]},
 'calltype-rules':{feature:'core-call-types',label:'Classify paid calls by destination',fields:[field('callTypeId','text','Call type ID'),field('prefix','text','Destination prefix')]},
 normalization:{feature:'core-localizations',label:'Number normalization',fields:[field('prefix','text','Dialed prefix'),field('replacement','text','Replace prefix with digits')]},
 'personal-rates':{feature:'personalized-rates',label:'Account rate override',fields:[field('userId','text','Workspace user ID'),field('prefix','text','Destination prefix'),field('rate','text','USD per minute'),field('first','number','First interval seconds'),field('step','number','Next interval seconds')]},
 'callerid-rates':{feature:'core-callerid-billing',label:'Caller ID rate override',fields:[field('callerId','text','Caller ID in E.164'),field('prefix','text','Destination prefix'),field('rate','text','USD per minute'),field('first','number','First interval seconds'),field('step','number','Next interval seconds')]},
 'international-credit':{feature:'international-credit',label:'International monthly budget',fields:[field('userId','text','Workspace user ID'),field('homePrefix','text','Domestic destination prefix'),field('limitCents','number','Monthly international limit in USD cents')]},
 'country-prefixes':{feature:'country-reports',label:'Country reporting prefix',fields:[field('prefix','text','Destination prefix'),field('country','text','Country or numbering region label')]},
 'shadow-rates':{feature:'shadow-billing',label:'Shadow rate (no wallet charge)',fields:[field('prefix','text','Destination prefix'),field('rate','text','USD per minute'),field('first','number','First interval seconds'),field('step','number','Next interval seconds')]},
 'time-windows':{feature:'demand-routing',label:'Allowed call window in UTC',fields:[field('prefix','text','Destination prefix'),field('days','text','UTC weekdays, 0 Sunday to 6 Saturday, comma separated'),field('startMinute','number','Start minute of day (0–1439)'),field('endMinute','number','End minute of day (1–1440)')]}
};
export function validatePolicy(kind,input){
 const definition=policyDefinitions[kind];if(!definition||!input||typeof input!=='object'||Array.isArray(input))throw Error('Known policy and object required');
 const data={};for(const f of definition.fields){const v=input[f.name];if(f.type==='number'){if(!Number.isSafeInteger(v)||v<0)throw Error(f.label+' must be a nonnegative integer');}else if(typeof v!=='string'||v.length>200)throw Error(f.label+' must be text up to 200 characters');data[f.name]=typeof v==='string'?v.trim():v;}
 if('prefix'in data&&!/^\+?\d{1,15}$/.test(data.prefix))throw Error('Numeric prefix required');
 if(kind!=='normalization'&&'prefix'in data&&!/^\+?[1-9]\d{0,14}$/.test(data.prefix))throw Error('E.164 destination prefix required');
 if('prefix'in data)data.prefix=data.prefix.replace(/^\+/,'');
 if(kind==='normalization'&&!/^\d{0,15}$/.test(data.replacement))throw Error('Numeric replacement required');
 if('groupId'in data&&!uuid.test(data.groupId))throw Error('Valid rate group ID required');
 if('callTypeId'in data&&!uuid.test(data.callTypeId))throw Error('Valid call type ID required');
 if('userId'in data&&!uuid.test(data.userId))throw Error('Valid user ID required');
 if('callerId'in data){if(!/^\+?[1-9]\d{7,14}$/.test(data.callerId))throw Error('Valid E.164 caller ID required');data.callerId=data.callerId.replace(/^\+/,'');}
 if('rate'in data&&(!/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(data.rate)||data.first<1||data.first>3600||data.step<1||data.step>3600))throw Error('Rate and intervals are invalid');
 if(kind==='international-credit'&&(!/^[1-9]\d{0,14}$/.test(data.homePrefix)||data.limitCents>1000000000))throw Error('Domestic prefix and limit up to 1000000000 cents required');
 if(kind==='country-prefixes'&&!data.country)throw Error('Country label required');
 if(kind==='time-windows'){
  if(!/^[0-6](,[0-6]){0,6}$/.test(data.days)||new Set(data.days.split(',')).size!==data.days.split(',').length||data.startMinute>1439||data.endMinute>1440||data.endMinute<=data.startMinute)throw Error('Use distinct weekdays and a same-day UTC time window');
 }
 return data;
}
export function policyKey(kind,d){return ['international-credit','group-assignments'].includes(kind)?d.userId:kind==='group-rates'?d.groupId+':'+d.prefix:kind==='personal-rates'?d.userId+':'+d.prefix:kind==='callerid-rates'?d.callerId+':'+d.prefix:d.prefix;}
export async function migrateTelecomPolicies(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS telecom_policies(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,kind VARCHAR(32) NOT NULL,rule_key VARCHAR(100) NOT NULL,data JSON NOT NULL,enabled BOOLEAN NOT NULL DEFAULT TRUE,revision INT UNSIGNED NOT NULL DEFAULT 1,updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),UNIQUE KEY policy_identity(tenant_id,kind,rule_key),INDEX policy_lookup(tenant_id,kind,enabled),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS telecom_shadow_ledger(call_key CHAR(64) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,policy_id CHAR(36) NOT NULL,actual_cents BIGINT UNSIGNED NOT NULL,shadow_cents BIGINT UNSIGNED NOT NULL,seconds INT UNSIGNED NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX shadow_tenant(tenant_id,created_at),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id)) ENGINE=InnoDB`);
}
export const decodePolicy=row=>({...row,data:typeof row.data==='string'?JSON.parse(row.data):row.data,enabled:!!Number(row.enabled),revision:Number(row.revision)});
export async function loadTelecomPolicies(db,tenant){return (await db.query(`SELECT p.id,p.kind,p.data,p.enabled,p.revision FROM telecom_policies p WHERE p.tenant_id=$1 AND p.enabled=TRUE AND (JSON_EXTRACT(p.data,'$.groupId') IS NULL OR EXISTS(SELECT 1 FROM telecom_tariff_catalog c WHERE c.id=JSON_UNQUOTE(p.data->'$.groupId') AND c.tenant_id=p.tenant_id AND c.kind='rate-groups' AND c.enabled=TRUE)) AND (JSON_EXTRACT(p.data,'$.callTypeId') IS NULL OR EXISTS(SELECT 1 FROM telecom_tariff_catalog c WHERE c.id=JSON_UNQUOTE(p.data->'$.callTypeId') AND c.tenant_id=p.tenant_id AND c.kind='call-types' AND c.enabled=TRUE))`,[tenant])).rows.map(decodePolicy);}
export function normalizeDestination(raw,rules){
 let digits=String(raw).replace(/^\+/,'');
 const rule=rules.filter(r=>r.kind==='normalization'&&r.enabled&&digits.startsWith(r.data.prefix)).sort((a,b)=>b.data.prefix.length-a.data.prefix.length)[0];
 if(rule)digits=rule.data.replacement+digits.slice(rule.data.prefix.length);
 if(!/^[1-9]\d{7,14}$/.test(digits))throw Error('Normalized E.164 destination required');return digits;
}
export function selectPolicyRate(rules,{userId,callerId,destination}){
 const group=rules.find(r=>r.enabled&&r.kind==='group-assignments'&&r.data.userId===userId)?.data.groupId;
 const order={'personal-rates':0,'callerid-rates':1,'group-rates':2};
 return rules.filter(r=>r.enabled&&((r.kind==='personal-rates'&&r.data.userId===userId)||(r.kind==='callerid-rates'&&r.data.callerId===String(callerId).replace(/^\+/,''))||(r.kind==='group-rates'&&r.data.groupId===group))&&destination.startsWith(r.data.prefix)).sort((a,b)=>b.data.prefix.length-a.data.prefix.length||order[a.kind]-order[b.kind]||a.id.localeCompare(b.id))[0]||null;
}
export function selectCallType(rules,destination){return rules.filter(r=>r.enabled&&r.kind==='calltype-rules'&&destination.startsWith(r.data.prefix)).sort((a,b)=>b.data.prefix.length-a.data.prefix.length)[0]?.data.callTypeId||null;}
export function assertCallingWindow(rules,destination,at=new Date()){
 const rule=rules.filter(r=>r.enabled&&r.kind==='time-windows'&&destination.startsWith(r.data.prefix)).sort((a,b)=>b.data.prefix.length-a.data.prefix.length)[0];
 if(rule&&(!rule.data.days.split(',').includes(String(at.getUTCDay()))||at.getUTCHours()*60+at.getUTCMinutes()<rule.data.startMinute||at.getUTCHours()*60+at.getUTCMinutes()>=rule.data.endMinute))throw Error('Destination outside allowed UTC calling window');
}
export function selectShadowRate(rules,destination){return rules.filter(r=>r.enabled&&r.kind==='shadow-rates'&&destination.startsWith(r.data.prefix)).sort((a,b)=>b.data.prefix.length-a.data.prefix.length)[0]||null;}
export async function internationalAllowance(db,rules,{tenantId,userId,destination}){
 const rule=rules.find(r=>r.kind==='international-credit'&&r.enabled&&r.data.userId===userId&&!destination.startsWith(r.data.homePrefix));
 if(!rule)return Infinity;
 const used=Number((await db.query("SELECT COALESCE(SUM(CASE WHEN status='settled' THEN charged_cents ELSE reserved_cents END),0) AS cents FROM pstn_calls WHERE tenant_id=$1 AND user_id=$2 AND destination NOT LIKE CONCAT($3,'%') AND (status<>'settled' OR settled_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01 00:00:00'))",[tenantId,userId,rule.data.homePrefix])).rows[0]?.cents||0);
 return Math.max(0,rule.data.limitCents-used);
}
export async function handleTelecomPolicies({req,res,path,user,pool,send,readJson}){
 if(user?.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const [kind,id,...extra]=path.slice('/api/admin/telecom/policies/'.length).split('/');
 if(!policyDefinitions[kind]||extra.length||id&&!uuid.test(id))return send(res,404,{error:'Unknown policy resource'});
 if(req.method==='GET'&&!id){const rows=(await pool.query('SELECT id,kind,data,enabled,revision,updated_at FROM telecom_policies WHERE tenant_id=$1 AND kind=$2 ORDER BY rule_key LIMIT 2001',[user.tenant_id,kind])).rows;return send(res,200,{definition:policyDefinitions[kind],rows:rows.map(decodePolicy)});}
 if(!((req.method==='POST'&&!id)||(req.method==='PUT'&&id)))return send(res,405,{error:'Use GET, POST or PUT'});
 let b,data;try{b=await readJson(req);data=validatePolicy(kind,b.data);if(typeof b.enabled!=='boolean'||id&&(!Number.isInteger(b.revision)||b.revision<1))throw Error('Enabled state and current revision required');}catch(e){return send(res,400,{error:e.message});}
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  // Lock the tenant so concurrent creates cannot bypass the per-kind bound.
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[user.tenant_id]);
  if(data.userId&&!(await db.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active'",[data.userId,user.tenant_id])).rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Active workspace user required'});}
  const catalogId=data.groupId||data.callTypeId;
  if(catalogId&&!(await db.query('SELECT id FROM telecom_tariff_catalog WHERE id=$1 AND tenant_id=$2 AND kind=$3 AND enabled=TRUE',[catalogId,user.tenant_id,data.groupId?'rate-groups':'call-types'])).rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Enabled workspace catalog entry required'});}
  if(id){const result=await db.query('UPDATE telecom_policies SET rule_key=$1,data=$2,enabled=$3,revision=revision+1,updated_by=$4 WHERE id=$5 AND tenant_id=$6 AND kind=$7 AND revision=$8',[policyKey(kind,data),JSON.stringify(data),b.enabled,user.id,id,user.tenant_id,kind,b.revision]);if(!result.rowCount){await db.query('ROLLBACK');return send(res,409,{error:'Policy unavailable or changed; refresh'});}}
  else{
   const count=Number((await db.query('SELECT COUNT(*) AS n FROM telecom_policies WHERE tenant_id=$1 AND kind=$2',[user.tenant_id,kind])).rows[0]?.n||0);if(count>=2000){await db.query('ROLLBACK');return send(res,409,{error:'Policy limit reached; edit an existing rule'});}
   await db.query('INSERT INTO telecom_policies(id,tenant_id,kind,rule_key,data,enabled,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),user.tenant_id,kind,policyKey(kind,data),JSON.stringify(data),b.enabled,user.id]);
  }
  await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,$4)',[randomUUID(),user.tenant_id,user.id,'telecom_policy_'+kind]);await db.query('COMMIT');return send(res,id?200:201,{saved:true});
 }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'A rule with this identity already exists'});throw e;}finally{db.release();}
}
