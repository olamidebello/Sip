import test from 'node:test';
import assert from 'node:assert/strict';
import {adminRouteAllowed,adminRouteCapability,scopedAdminUser,changeAdminRole,handleAdminGroup,adminGroupPolicy} from './adminGroup.js';
const admin={id:'actor',role:'admin',tenant_id:'tenant-a'},superUser={...admin,role:'super_admin'};
const policyPool=(permissions=[],enabled=1)=>({query:async(sql,args)=>{assert.equal(args[0],'tenant-a');return {rows:[{enabled,permissions,revision:1}]};}});
test('Admin is deny-by-default for all unlisted operations, even with every delegated permission',async()=>{
 const pool=policyPool(['users.read','reports.read','cdr.read','plans.read','plans.write','support.manage']);
 for(const [path,method]of [['/api/admin/system-admin-group','PUT'],['/api/admin/tenant-users','POST'],['/api/admin/groups','POST'],['/api/admin/users/x/security','POST'],['/api/admin/api-bridge/keys','GET'],['/api/admin/provider-credentials','GET'],['/api/admin/tenants','POST'],['/api/admin/unknown','GET']])assert.equal(await adminRouteAllowed(pool,admin,path,method),false);
 assert.equal(await adminRouteAllowed(pool,superUser,'/api/admin/unknown','POST'),true);
});
test('exact read/write permissions and enabled flag control access; malformed paths do not inherit grants',async()=>{
 assert.equal(await adminRouteAllowed(policyPool(['plans.read']),admin,'/api/admin/plans','GET'),true);
 assert.equal(await adminRouteAllowed(policyPool(['plans.read']),admin,'/api/admin/plans','POST'),false);
 assert.equal(await adminRouteAllowed(policyPool(['plans.write']),admin,'/api/admin/plans','POST'),true);
 assert.equal(await adminRouteAllowed(policyPool(['users.read'],0),admin,'/api/admin/users','GET'),false);
 assert.equal(adminRouteCapability('/api/admin/users/credentials','GET'),null);
 assert.equal(adminRouteCapability('/api/admin/plans/../../tenants','PUT'),null);
 assert.equal(await adminRouteAllowed({}, {role:'user'},'/api/admin/users','GET'),false);
});
test('Admin personal routes have ordinary-user authority; support elevation requires explicit active grant',async()=>{
 assert.equal((await scopedAdminUser(policyPool([]),admin,'/api/pbx/extensions')).role,'user');
 assert.equal((await scopedAdminUser(policyPool([]),admin,'/api/support/tickets')).role,'user');
 assert.equal((await scopedAdminUser(policyPool(['support.manage']),admin,'/api/support/tickets')).role,'admin');
 assert.equal((await scopedAdminUser(policyPool(['support.manage'],0),admin,'/api/support/tickets')).role,'user');
 assert.equal((await scopedAdminUser({},superUser,'/api/pbx/extensions')).role,'super_admin');
});
function fixture({last=false,role='super_admin',self=false,missing=false}={}){
 const calls=[],target={id:self?'actor':'target',tenant_id:'tenant-a',role,status:'active'};
 const db={release(){calls.push(['release']);},async query(sql,args=[]){calls.push([sql,args]);let rows=[];
 if(sql.includes('GET_LOCK'))rows=[{acquired:1}];
 else if(sql.includes('SELECT id,tenant_id,role,status FROM users'))rows=missing?[]:[target];
 else if(sql.includes('SELECT tenant_id FROM system_admin_group'))rows=[{tenant_id:'tenant-a'}];
 else if(sql.includes('COUNT(*) AS n'))rows=[{n:last?0:1}];
 return {rows,rowCount:rows.length||1};}};
 return {calls,pool:{connect:async()=>db}};
}
test('requested super-to-Admin demotion is transactional, tenant-scoped, audited and revokes sessions',async()=>{
 const f=fixture();const r=await changeAdminRole(f.pool,{actor:superUser,targetId:'target',tenantId:'tenant-a',role:'admin'});
 assert.equal(r.previousRole,'super_admin');assert.equal(r.role,'admin');
 assert.ok(f.calls.some(([s,a])=>s.includes('AND tenant_id=$2 FOR UPDATE')&&a[1]==='tenant-a'));
 assert.ok(f.calls.some(([s,a])=>s==='DELETE FROM sessions WHERE user_id=$1'&&a[0]==='target'));
 assert.ok(f.calls.some(([s])=>s.includes('system_admin_role_changed')));assert.ok(f.calls.some(([s])=>s==='COMMIT'));
});
test('last active Super Admin and own role changes are protected',async()=>{
 for(const options of [{last:true},{self:true}]){const f=fixture(options);await assert.rejects(changeAdminRole(f.pool,{actor:superUser,targetId:'target',tenantId:'tenant-a',role:'admin'}),e=>e.httpStatus===409);assert.equal(f.calls.some(([s])=>s.startsWith('UPDATE users')),false);assert.ok(f.calls.some(([s])=>s==='ROLLBACK'));}
});
test('cannot appoint Super Admin through Admin group management',async()=>{
 await assert.rejects(changeAdminRole({}, {role:'super_admin'}),e=>e.httpStatus===400);
});
test('group management rejects ordinary Admin before querying database',async()=>{
 const r=await handleAdminGroup({req:{method:'GET'},path:'/api/admin/system-admin-group',user:admin,pool:{query(){throw Error('Must not query');}},send:(_r,status,body)=>({status,body})});assert.equal(r.status,403);
});
test('stale revision rolls back without changing policy',async()=>{
 const calls=[],db={query:async sql=>{calls.push(sql);return {rowCount:0,rows:[]};},release(){}};
 const r=await handleAdminGroup({req:{method:'PUT'},path:'/api/admin/system-admin-group',user:superUser,pool:{connect:async()=>db},readJson:async()=>({enabled:true,revision:1,permissions:['users.read']}),send:(_r,status,body)=>({status,body})});
 assert.equal(r.status,409);assert.ok(calls.includes('ROLLBACK'));assert.equal(calls.includes('COMMIT'),false);
});
test('missing or malformed group policy fails closed',async()=>{
 const missing=await adminGroupPolicy({query:async()=>({rows:[]})},'t');assert.deepEqual(missing.permissions,[]);assert.equal(missing.enabled,false);
 const bad=await adminGroupPolicy({query:async()=>({rows:[{enabled:1,permissions:'invalid',revision:1}]})},'t');assert.deepEqual(bad.permissions,[]);
});
