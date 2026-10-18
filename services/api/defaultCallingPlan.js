import {createHash} from 'node:crypto';
export const TRIAL_SECONDS=120;
export function defaultPlanId(tenant){
 const h=createHash('sha256').update('default-two-minute-plan:'+tenant).digest('hex');
 return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function trialRefund(reserved,seconds,failed=false){
 if(!Number.isInteger(reserved)||reserved<1||reserved>120||!Number.isFinite(seconds)||seconds<0)throw Error('Invalid trial settlement');
 return reserved-(failed?0:Math.min(reserved,Math.max(1,Math.ceil(seconds))));
}
export async function ensureDefaultCallingPlan(db,userId){
 const u=(await db.query("SELECT tenant_id FROM users WHERE id=$1 AND status='active'",[userId])).rows[0];
 if(!u)return;
 const id=defaultPlanId(u.tenant_id);
 await db.query("INSERT IGNORE INTO plans(id,tenant_id,name,description,monthly_cents,active) VALUES($1,$2,'Starter — 2 free minutes','One-time 120-second outbound calling allowance. Carrier and caller ID requirements apply.',0,TRUE)",[id,u.tenant_id]);
 await db.query("INSERT INTO subscriptions(user_id,plan_id,status) VALUES($1,$2,'active') ON DUPLICATE KEY UPDATE plan_id=IF(status='active',plan_id,VALUES(plan_id)),status='active'",[userId,id]);
 await db.query('INSERT IGNORE INTO calling_trial_balances(user_id,tenant_id,remaining_seconds) VALUES($1,$2,120)',[userId,u.tenant_id]);
}
export async function migrateDefaultCallingPlan(db){
 await db.query(`CREATE TABLE IF NOT EXISTS calling_trial_balances (
 user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,remaining_seconds INT UNSIGNED NOT NULL DEFAULT 120,
 FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CHECK(remaining_seconds<=120)) ENGINE=InnoDB`);
 const users=(await db.query("SELECT u.id FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.status='active' AND t.status='active'")).rows;
 for(const u of users)await ensureDefaultCallingPlan(db,u.id);
}
