import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';

const fields={flowroute:['accessKey','secretKey'],didww:['apiKey','environment']};
function masterKey(){
  const raw=process.env.PROVIDER_CREDENTIAL_KEY;
  return /^[a-f0-9]{64}$/i.test(raw||'')?Buffer.from(raw,'hex'):null;
}
function seal(value,key,tenant,provider){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(tenant+':'+provider));
  return Buffer.concat([iv,cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]);
}
function unseal(value,key,tenant,provider){
  const buf=Buffer.from(value),cipher=createDecipheriv('aes-256-gcm',key,buf.subarray(0,12));
  cipher.setAAD(Buffer.from(tenant+':'+provider));cipher.setAuthTag(buf.subarray(-16));
  return JSON.parse(Buffer.concat([cipher.update(buf.subarray(12,-16)),cipher.final()]).toString('utf8'));
}
export async function migrateProviderCredentials(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS provider_api_credentials (
    tenant_id CHAR(36) NOT NULL,provider VARCHAR(16) NOT NULL,
    ciphertext BLOB NOT NULL,revision INT UNSIGNED NOT NULL DEFAULT 1,
    updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY(tenant_id,provider),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}
export async function providerCredentials(pool,tenant,provider){
  const key=masterKey();
  if(!key||!pool||!tenant)return null;
  const result=await pool.query('SELECT ciphertext FROM provider_api_credentials WHERE tenant_id=$1 AND provider=$2',
    [tenant,provider]);
  return result.rowCount?unseal(result.rows[0].ciphertext,key,tenant,provider):null;
}
export async function handleProviderCredentials({req,res,path,user,pool,send,readJson}){
  if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  if(path==='/api/admin/carriers/credentials'&&req.method==='GET'){
    const rows=await pool.query('SELECT provider,revision,updated_at FROM provider_api_credentials WHERE tenant_id=$1',
      [user.tenant_id]);
    return send(res,200,{entries:rows.rows,keyReady:!!masterKey(),
      note:'Secrets are write-only; verification uses the provider inventory API.'});
  }
  const match=/^\/api\/admin\/carriers\/credentials\/(flowroute|didww)$/.exec(path);
  if(!match)return send(res,404,{error:'Provider credentials route unavailable'});
  const provider=match[1];
  if(req.method==='DELETE'){
    const result=await pool.query('DELETE FROM provider_api_credentials WHERE tenant_id=$1 AND provider=$2',
      [user.tenant_id,provider]);
    return send(res,result.rowCount?200:404,result.rowCount?{removed:true}:{error:'No stored credentials'});
  }
  if(req.method!=='PUT')return send(res,405,{error:'PUT required'});
  const key=masterKey();
  if(!key)return send(res,409,{error:'Configure PROVIDER_CREDENTIAL_KEY (64 hex characters) on the API server'});
  const value=await readJson(req);
  if(!Number.isSafeInteger(value.expectedRevision)||value.expectedRevision<0||
    Object.keys(value).some(name=>name!=='expectedRevision'&&!fields[provider].includes(name))||
    fields[provider].some(name=>typeof value[name]!=='string'||!value[name].trim()||value[name].length>256)||
    (provider==='didww'&&!['sandbox','production'].includes(value.environment)))
    return send(res,400,{error:'Complete provider credentials and current revision required'});
  const credentials=Object.fromEntries(fields[provider].map(name=>[name,value[name].trim()]));
  const db=await pool.connect();
  try{
    await db.query('START TRANSACTION');
    const old=await db.query('SELECT revision FROM provider_api_credentials WHERE tenant_id=$1 AND provider=$2 FOR UPDATE',
      [user.tenant_id,provider]);
    const previous=Number(old.rows[0]?.revision||0);
    if(previous!==value.expectedRevision){
      await db.query('ROLLBACK');return send(res,409,{error:'Credentials changed; refresh before saving'});
    }
    const revision=previous+1;
    await db.query(`INSERT INTO provider_api_credentials(tenant_id,provider,ciphertext,revision,updated_by)
      VALUES($1,$2,$3,$4,$5) ON DUPLICATE KEY UPDATE ciphertext=VALUES(ciphertext),
      revision=VALUES(revision),updated_by=VALUES(updated_by)`,
      [user.tenant_id,provider,seal(credentials,key,user.tenant_id,provider),revision,user.id]);
    await db.query("INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)",
      [globalThis.crypto.randomUUID(),user.tenant_id,user.id,'provider_credentials_'+provider+'_updated']);
    await db.query('COMMIT');return send(res,200,{provider,revision,configured:true});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
