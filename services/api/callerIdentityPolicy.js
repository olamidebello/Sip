import {randomUUID} from 'node:crypto';
import {loadPolicy,assignedIdentity} from './outboundDids.js';
const e164=/^\+[1-9][0-9]{7,14}$/;
export async function migrateCallerIdentityPolicy(pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS caller_identity_policy (
 tenant_id CHAR(36) PRIMARY KEY,require_assigned_did BOOLEAN NOT NULL DEFAULT FALSE,
 updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB`);
}
export async function getCallerIdentityPolicy(db,tenant){
 const r=(await db.query('SELECT require_assigned_did FROM caller_identity_policy WHERE tenant_id=$1',[tenant])).rows[0];
 return {requireAssignedDid:!!Number(r?.require_assigned_did||0)};
}
export async function resolveCallerIdentity(db,tenant,user,{policyLoader=loadPolicy,assigned=assignedIdentity}={}){
 const setting=await getCallerIdentityPolicy(db,tenant);
 const approval=(await db.query('SELECT number_e164,authorized FROM managed_outbound_identities WHERE user_id=$1 AND tenant_id=$2',[user,tenant])).rows[0];
 if(approval&&!Number(approval.authorized))throw Error('Outbound caller ID is disabled by administrator');
 const primary=async()=>{
  const r=(await db.query("SELECT o.number_e164 FROM user_primary_did p JOIN did_shop_orders o ON o.id=p.order_id AND o.tenant_id=p.tenant_id AND o.user_id=p.user_id WHERE p.user_id=$1 AND p.tenant_id=$2 AND o.status='active' AND o.rental_until>UTC_TIMESTAMP(3)",[user,tenant])).rows[0];
  return r&&e164.test(r.number_e164)?{callerId:r.number_e164,provider:'flowroute'}:null;
 };
 if(setting.requireAssignedDid){const rented=await primary();if(rented)return rented;const result=assigned(policyLoader(),tenant,user);if(!result)throw Error('No authorized outbound DID assigned to this user');return result;}
 const profile=(await db.query('SELECT p.phone_e164 FROM user_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=$1 AND u.tenant_id=$2 AND u.status=\'active\'',[user,tenant])).rows[0];
 if(profile&&e164.test(profile.phone_e164||'')){
  if(approval&&Number(approval.authorized)&&approval.number_e164===profile.phone_e164)return {callerId:profile.phone_e164,provider:'flowroute'};
  // Static assignments are also explicit authorization; never trust an arbitrary profile edit.
  const config=policyLoader(),entry=config.tenants?.[tenant]?.assignments?.find(a=>a.userId===user&&a.number===profile.phone_e164&&a.authorized===true);
  if(entry)return assigned(config,tenant,user);
 }
 const rented=await primary();if(rented)return rented;
 throw Error('Profile phone number requires caller-ID authorization by super administrator');
}
export async function handleCallerIdentityPolicy({req,res,user,pool,send,readJson}){
 if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 if(req.method==='GET')return send(res,200,await getCallerIdentityPolicy(pool,user.tenant_id));
 if(req.method!=='PUT')return send(res,405,{error:'GET or PUT required'});
 const b=await readJson(req);if(typeof b.requireAssignedDid!=='boolean')return send(res,400,{error:'Assigned-DID requirement must be true or false'});
 const db=await pool.connect();try{await db.query('START TRANSACTION');
 await db.query('INSERT INTO caller_identity_policy(tenant_id,require_assigned_did,updated_by) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE require_assigned_did=VALUES(require_assigned_did),updated_by=VALUES(updated_by)',[user.tenant_id,b.requireAssignedDid,user.id]);
 await db.query("INSERT INTO security_events(id,tenant_id,actor_id,target_id,action) VALUES($1,$2,$3,NULL,'caller_identity_policy_changed')",[randomUUID(),user.tenant_id,user.id]);
 await db.query('COMMIT');return send(res,200,{requireAssignedDid:b.requireAssignedDid});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
