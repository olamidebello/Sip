import {randomBytes,createCipheriv,createDecipheriv,randomUUID} from 'node:crypto';

const key = () => /^[0-9a-f]{64}$/i.test(process.env.EMAIL_CONFIG_KEY||'') ? Buffer.from(process.env.EMAIL_CONFIG_KEY,'hex') : null;
const validSender = value => typeof value==='string' && value.length<=254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
function seal(value,master){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',master,iv);
  cipher.setAAD(Buffer.from('olamide:email-verification:v1'));
  return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);
}
function unseal(value,master){
  const data=Buffer.from(value),cipher=createDecipheriv('aes-256-gcm',master,data.subarray(0,12));
  cipher.setAAD(Buffer.from('olamide:email-verification:v1'));cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString('utf8');
}
export async function migrateEmailConfiguration(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS email_verification_configuration (
    id TINYINT UNSIGNED PRIMARY KEY,secret_cipher BLOB NOT NULL,sender VARCHAR(254) NOT NULL,
    updated_by CHAR(36) NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ON UPDATE CURRENT_TIMESTAMP(3),FOREIGN KEY(updated_by) REFERENCES users(id)
  ) ENGINE=InnoDB`);
}
export async function verificationSender(pool){
  const result=await pool.query('SELECT secret_cipher,sender FROM email_verification_configuration WHERE id=1');
  if(result.rowCount){
    const master=key();if(!master)return null; // never silently use a fallback if a stored key cannot be decrypted
    return {apiKey:unseal(result.rows[0].secret_cipher,master),from:result.rows[0].sender};
  }
  return process.env.RESEND_API_KEY && validSender(process.env.RESEND_FROM)
    ? {apiKey:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM}:null;
}
export async function deliverEmail({apiKey,from,to,subject,text,origin}){
  const url=process.env.RESEND_API_URL||'https://api.resend.com/emails';
  if(url!=='https://api.resend.com/emails' &&
      !(origin.startsWith('http://127.0.0.1:') && /^http:\/\/127\.0\.0\.1:\d+\/emails$/.test(url)))
    throw new Error('Invalid email delivery URL');
  const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(10000),
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:[to],subject,text})});
  if(!response.ok)throw new Error('Email delivery failed');
}
export async function handleEmailConfiguration({req,res,path,user,pool,send,readJson,origin}){
  if(user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
  if(path==='/api/admin/email-verification' && req.method==='GET'){
    const result=await pool.query('SELECT sender,updated_at FROM email_verification_configuration WHERE id=1');
    const stored=!!result.rowCount;
    return send(res,200,{configured:(stored&&!!key())||(!stored&&!!(process.env.RESEND_API_KEY&&validSender(process.env.RESEND_FROM))),
      source:stored?'database':process.env.RESEND_API_KEY&&validSender(process.env.RESEND_FROM)?'environment':'none',
      sender:result.rows[0]?.sender|| (process.env.RESEND_API_KEY?process.env.RESEND_FROM:null),
      encryptionReady:!!key(),otpReady:!!(process.env.OTP_HMAC_SECRET?.length>=32),
      updatedAt:result.rows[0]?.updated_at||null});
  }
  if(path==='/api/admin/email-verification' && req.method==='PUT'){
    const master=key();if(!master)return send(res,409,{error:'Email encryption key is unavailable on the server'});
    const body=await readJson(req);
    if(!body||typeof body.apiKey!=='string'||!/^re_[A-Za-z0-9_]{16,}$/.test(body.apiKey)||
        !validSender(body.sender)||Object.keys(body).some(name=>!['apiKey','sender'].includes(name)))
      return send(res,400,{error:'Valid Resend sending key and verified sender email required'});
    await pool.query(`INSERT INTO email_verification_configuration(id,secret_cipher,sender,updated_by)
      VALUES(1,$1,$2,$3) ON DUPLICATE KEY UPDATE secret_cipher=VALUES(secret_cipher),sender=VALUES(sender),updated_by=VALUES(updated_by)`,
      [seal(body.apiKey,master),body.sender,user.id]);
    await pool.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',
      [randomUUID(),user.tenant_id,user.id,'email_verification_key_saved']);
    return send(res,200,{configured:true,sender:body.sender,otpReady:!!(process.env.OTP_HMAC_SECRET?.length>=32)});
  }
  if(path==='/api/admin/email-verification' && req.method==='DELETE'){
    await pool.query('DELETE FROM email_verification_configuration WHERE id=1');
    await pool.query('INSERT INTO security_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',
      [randomUUID(),user.tenant_id,user.id,'email_verification_key_removed']);
    return send(res,200,{removed:true,environmentFallback:!!(process.env.RESEND_API_KEY&&validSender(process.env.RESEND_FROM))});
  }
  if(path==='/api/admin/email-verification/test' && req.method==='POST'){
    const settings=await verificationSender(pool);
    if(!settings)return send(res,409,{error:'Configure the sender and key first'});
    try{await deliverEmail({...settings,to:user.email,subject:'Olamide email delivery test',
      text:'The Olamide verification email configuration sent this test message. No verification code is included.',origin});}
    catch(error){console.error('Email configuration test failed',error.name);return send(res,502,{error:'Email provider rejected the test. Check the verified domain, sender and key.'});}
    return send(res,200,{status:'Test message accepted by the provider. Check your administrator inbox.'});
  }
  return send(res,404,{error:'Email configuration route unavailable'});
}
