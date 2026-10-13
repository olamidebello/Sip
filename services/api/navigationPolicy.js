import {randomUUID} from 'node:crypto';
// Presentation permissions never confer administrator roles or service entitlements.
export const EXTRA_NAVIGATION = Object.freeze({money:'Money',dashboard:'Dashboard','campaign-inbox-panel':'Announcements',planner:'Events & tasks','search-panel':'Workspace search','external-sms':'External text messages','outbound-rates':'Outbound rates',meetings:'Meetings','agent-panel':'Call center','product-store':'Products & services',billing:'Plans, numbers & billing','dialplan-marketplace':'Dial plan marketplace',geo:'Calling area','activity-monitor':'Activity monitor'});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const decode=value=>typeof value==='string'?JSON.parse(value):value||{};
export function validateNavigationPolicy(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([key,val])=>!Object.hasOwn(EXTRA_NAVIGATION,key)||typeof val!=='boolean'))throw new Error('Only listed navigation keys with boolean values are accepted');
 return {...value};
}
export function resolveNavigation(groups=[],override={}){
 const result=Object.fromEntries(Object.keys(EXTRA_NAVIGATION).map(key=>[key,false]));
 for(const key of Object.keys(result)){const values=groups.map(decode).map(g=>g[key]);result[key]=values.includes(false)?false:values.includes(true)||key==='money';}
 return {...result,...validateNavigationPolicy(decode(override))};
}
export async function migrateNavigationPolicy(pool){
 for(const [kind,table]of [['user','users'],['group','user_groups']])await pool.query(`CREATE TABLE IF NOT EXISTS ${kind}_navigation_policy (
 ${kind}_id CHAR(36) PRIMARY KEY, policy JSON NOT NULL,revision INT UNSIGNED NOT NULL DEFAULT 1,
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(${kind}_id) REFERENCES ${table}(id) ON DELETE CASCADE) ENGINE=InnoDB`);
}
export async function navigationFor(pool,user){
 const groups=await pool.query('SELECT p.policy FROM user_group_members m JOIN user_groups g ON g.id=m.group_id JOIN group_navigation_policy p ON p.group_id=g.id WHERE m.user_id=$1 AND g.tenant_id=$2',[user.id,user.tenant_id]);
 const own=await pool.query('SELECT policy FROM user_navigation_policy WHERE user_id=$1',[user.id]);
 return resolveNavigation(groups.rows.map(g=>g.policy),own.rows[0]?.policy);
}
export async function handleNavigationPolicy({req,res,path,user,pool,send,readJson}){
 if(path==='/api/navigation'&&req.method==='GET')return send(res,200,{extras:await navigationFor(pool,user)});
 if(user.role!=='super_admin')return send(res,403,{error:'Super admin required'});
 if(path==='/api/admin/navigation'&&req.method==='GET'){
 const users=await pool.query('SELECT u.id,u.display_name AS name,u.email,COALESCE(p.revision,0) AS revision,p.policy FROM users u LEFT JOIN user_navigation_policy p ON p.user_id=u.id WHERE u.tenant_id=$1 ORDER BY u.display_name,u.id LIMIT 500',[user.tenant_id]);
 const groups=await pool.query('SELECT g.id,g.name,COALESCE(p.revision,0) AS revision,p.policy FROM user_groups g LEFT JOIN group_navigation_policy p ON p.group_id=g.id WHERE g.tenant_id=$1 ORDER BY g.name,g.id LIMIT 500',[user.tenant_id]);
 return send(res,200,{catalog:EXTRA_NAVIGATION,users:users.rows.map(u=>({...u,policy:decode(u.policy)})),groups:groups.rows.map(g=>({...g,policy:decode(g.policy)}))});
 }
 const match=/^\/api\/admin\/navigation\/(users|groups)\/([^/]+)$/.exec(path);
 if(!match||!uuid.test(match[2])||req.method!=='PUT')return send(res,404,{error:'Navigation policy route unavailable'});
 let policy,revision;try{const body=await readJson(req);policy=validateNavigationPolicy(body.policy);revision=body.revision;if(!Number.isInteger(revision)||revision<0)throw new Error('Current revision required');}catch(error){return send(res,400,{error:error.message});}
 const kind=match[1]==='users'?'user':'group',table=kind==='user'?'users':'user_groups',db=await pool.connect();
 try{await db.query('BEGIN');const target=await db.query(`SELECT id FROM ${table} WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,[match[2],user.tenant_id]);
 if(!target.rowCount){await db.query('ROLLBACK');return send(res,404,{error:'Target unavailable in selected tenant'});}
 const old=await db.query(`SELECT revision FROM ${kind}_navigation_policy WHERE ${kind}_id=$1 FOR UPDATE`,[match[2]]);
 if(Number(old.rows[0]?.revision||0)!==revision){await db.query('ROLLBACK');return send(res,409,{error:'Policy changed; refresh before saving'});}
 await db.query(`INSERT INTO ${kind}_navigation_policy(${kind}_id,policy,revision) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE policy=VALUES(policy),revision=VALUES(revision)`,[match[2],JSON.stringify(policy),revision+1]);
 await db.query('INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.tenant_id,user.id,match[2],'navigation_policy_saved']);
 await db.query('COMMIT');return send(res,200,{policy,revision:revision+1});
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
