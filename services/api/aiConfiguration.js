import {randomBytes,createCipheriv,createDecipheriv,randomUUID} from 'node:crypto';

function masterKey(){
  const raw=process.env.AI_CONFIG_KEY||'';
  return /^[a-f0-9]{64}$/i.test(raw)?Buffer.from(raw,'hex'):null;
}
function encrypt(value,key){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('olamide:ai-support:v1'));
  return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);
}
function decrypt(value,key){
  const data=Buffer.from(value),cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
  cipher.setAAD(Buffer.from('olamide:ai-support:v1'));cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString('utf8');
}
export async function migrateAiConfiguration(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_support_configuration (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    secret_cipher BLOB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by CHAR(36) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}
export async function aiSupportKey(pool){
  const result=await pool.query('SELECT secret_cipher,enabled FROM ai_support_configuration WHERE id=1');
  if(result.rowCount){
    if(!result.rows[0].enabled)return null;
    const key=masterKey();
    if(!key)return null;
    return decrypt(result.rows[0].secret_cipher,key);
  }
  return process.env.OPENAI_SUPPORT_API_KEY||process.env.OPENAI_API_KEY||null;
}
export async function handleAiConfiguration({req,res,user,pool,send,readJson}){
  if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  if(req.method==='GET'){
    const result=await pool.query('SELECT enabled,updated_at FROM ai_support_configuration WHERE id=1');
    return send(res,200,{configured:!!result.rowCount,enabled:!!result.rows[0]?.enabled,encryptionReady:!!masterKey(),
      environmentFallback:!result.rowCount&&!!(process.env.OPENAI_SUPPORT_API_KEY||process.env.OPENAI_API_KEY),
      updatedAt:result.rows[0]?.updated_at||null});
  }
  if(req.method!=='PUT'&&req.method!=='DELETE')return send(res,405,{error:'Unsupported action'});
  if(req.method==='PUT'){
    const key=masterKey();if(!key)return send(res,409,{error:'AI encryption key is unavailable on the server'});
    const body=await readJson(req);
    if(typeof body.apiKey!=='string'||!/^sk-[\x21-\x7e]{17,253}$/.test(body.apiKey)||
      Object.keys(body).some(name=>name!=='apiKey'))return send(res,400,{error:'A valid OpenAI API key is required'});
    await pool.query(`INSERT INTO ai_support_configuration(id,secret_cipher,enabled,updated_by)
      VALUES(1,$1,TRUE,$2) ON DUPLICATE KEY UPDATE secret_cipher=VALUES(secret_cipher),enabled=TRUE,updated_by=VALUES(updated_by)`,
      [encrypt(body.apiKey,key),user.id]);
    await pool.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',
      [randomUUID(),user.tenant_id,user.id,'ai_support_key_saved']);
    return send(res,200,{configured:true,enabled:true});
  }
  await pool.query('DELETE FROM ai_support_configuration WHERE id=1');
  await pool.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',
    [randomUUID(),user.tenant_id,user.id,'ai_support_key_removed']);
  return send(res,200,{configured:false});
}
