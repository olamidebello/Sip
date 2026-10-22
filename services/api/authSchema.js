export const requiredAuthColumns={
 tenants:['id','status'],
 users:['id','tenant_id','email','username','role','status','auth_source','password_salt','password_hash'],
 sessions:['token_hash','user_id','expires_at','auth_method','created_at'],
 user_profiles:['user_id','phone_e164','address_line1','country'],
 user_groups:['id','tenant_id'],user_group_members:['user_id','group_id'],
 user_session_policy:['user_id','max_sessions'],
 signup_captchas:['id','answer_hash','expires_at'],signup_otps:['user_id','code_hash','attempts','expires_at'],
 passkeys:['id','user_id','public_key','counter'],passkey_challenges:['user_id','purpose','challenge','expires_at'],
 twilio_hub_settings:['tenant_id','ciphertext','enabled','version'],
 twilio_account_auth_policy:['tenant_id','policy','version','updated_by'],
 twilio_account_pins:['user_id','tenant_id','salt','pin_hash','failures','locked_ms'],
 twilio_account_challenges:['token_hash','tenant_id','user_id','purpose','phone','service_sid','account_sid','provider_sid','policy_version','hub_version','status','attempts','expires_ms','created_at']
};
export function inspectAuthColumns(rows){const found=new Set(rows.map(r=>r.TABLE_NAME+'.'+r.COLUMN_NAME));const missing=[];for(const [table,columns]of Object.entries(requiredAuthColumns))for(const column of columns)if(!found.has(table+'.'+column))missing.push(table+'.'+column);return {ready:missing.length===0,tables:Object.keys(requiredAuthColumns).length,missing};}
export async function auditAuthSchema(db){const rows=(await db.query('SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE()')).rows;const report=inspectAuthColumns(rows);if(!report.ready)throw Error('Missing authentication schema after migrations: '+report.missing.join(', '));return report;}
