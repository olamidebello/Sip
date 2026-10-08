import { generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { createSessionToken, tokenHash } from './security.js';
import { effectivePasskeyMode } from './passkeyPolicy.js';

const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const validCredential = value => value && typeof value === 'object' &&
  typeof value.id === 'string' && value.id.length <= 512;

export async function handlePasskeys({req,res,path,pool,send,readJson,origin,currentUser,featuresFor,sessionCookie}) {
  if (!path.startsWith('/api/passkeys')) return false;
  const rpID=new URL(origin).hostname;
  if (path==='/api/passkeys' && req.method==='GET') {
    const user=await currentUser(req);
    if(!user) return send(res,401,{error:'Sign in required'});
    const rows=await pool.query('SELECT id,device_type,backed_up,created_at FROM passkeys WHERE user_id=$1 ORDER BY created_at DESC',[user.id]);
    return send(res,200,{passkeys:rows.rows});
  }
  if (path==='/api/passkeys/register/options' && req.method==='POST') {
    const user=await currentUser(req);
    if(!user || user.auth_source!=='local') return send(res,401,{error:'Local account sign-in required'});
    const existing=await pool.query('SELECT id,transports FROM passkeys WHERE user_id=$1',[user.id]);
    const options=await generateRegistrationOptions({rpName:'Olamide',rpID,userName:user.email,
      userID:Buffer.from(user.id),attestationType:'none',
      authenticatorSelection:{residentKey:'preferred',userVerification:'required'},
      excludeCredentials:existing.rows.map(row=>({id:row.id,transports:row.transports}))});
    await pool.query("INSERT INTO passkey_challenges(user_id,purpose,challenge,expires_at) VALUES($1,'register',$2,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)) ON DUPLICATE KEY UPDATE challenge=$3,expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)",
      [user.id,options.challenge,options.challenge]);
    return send(res,200,options);
  }
  if (path==='/api/passkeys/register/verify' && req.method==='POST') {
    const user=await currentUser(req);
    if(!user || user.auth_source!=='local') return send(res,401,{error:'Local account sign-in required'});
    const response=await readJson(req,65536);
    if(!validCredential(response)) return send(res,400,{error:'Invalid passkey response'});
    const challenge=(await pool.query("SELECT challenge FROM passkey_challenges WHERE user_id=$1 AND purpose='register' AND expires_at>UTC_TIMESTAMP(3)",[user.id])).rows[0];
    if(!challenge) return send(res,400,{error:'Passkey challenge expired'});
    const consumed=await pool.query("DELETE FROM passkey_challenges WHERE user_id=$1 AND purpose='register' AND challenge=$2 AND expires_at>UTC_TIMESTAMP(3)",[user.id,challenge.challenge]);
    if(!consumed.rowCount) return send(res,400,{error:'Passkey challenge already used'});
    try {
      const verification=await verifyRegistrationResponse({response,expectedChallenge:challenge.challenge,
        expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});
      if(!verification.verified || !verification.registrationInfo) throw new Error('Unverified passkey');
      const {credential,credentialDeviceType,credentialBackedUp}=verification.registrationInfo;
      await pool.query('INSERT INTO passkeys(id,user_id,public_key,counter,transports,device_type,backed_up) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [credential.id,user.id,Buffer.from(credential.publicKey),credential.counter,JSON.stringify(credential.transports||[]),credentialDeviceType,credentialBackedUp]);
      return send(res,201,{status:'passkey_registered'});
    } catch(error) {console.error('Passkey registration failed',error.name);return send(res,400,{error:'Passkey verification failed'});}
  }
  if (path==='/api/passkeys/login/options' && req.method==='POST') {
    const {email}=await readJson(req);
    if(!validEmail(email)) return send(res,400,{error:'Valid email required'});
    const account=await pool.query("SELECT u.id FROM users u JOIN tenants t ON t.id=u.tenant_id AND t.status='active' LEFT JOIN tenant_auth_policy a ON a.tenant_id=u.tenant_id WHERE u.email=$1 AND u.status='active' AND u.auth_source='local' AND (a.local_enabled IS NULL OR a.local_enabled=TRUE OR u.role='super_admin')",[email.trim().toLowerCase()]);
    const id=account.rows[0]?.id;
    const keys=id?(await pool.query('SELECT id,transports FROM passkeys WHERE user_id=$1',[id])).rows:[];
    if(!keys.length) return send(res,404,{error:'No passkey available for this account'});
    const options=await generateAuthenticationOptions({rpID,userVerification:'required',
      allowCredentials:keys.map(key=>({id:key.id,transports:key.transports}))});
    await pool.query("INSERT INTO passkey_challenges(user_id,purpose,challenge,expires_at) VALUES($1,'login',$2,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)) ON DUPLICATE KEY UPDATE challenge=$3,expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE)",
      [id,options.challenge,options.challenge]);
    return send(res,200,options);
  }
  if (path==='/api/passkeys/login/verify' && req.method==='POST') {
    const {email,response}=await readJson(req,65536);
    if(!validEmail(email) || !validCredential(response)) return send(res,400,{error:'Invalid passkey response'});
    const found=await pool.query("SELECT u.id,u.display_name,u.email,u.role,u.tenant_id,p.id AS passkey_id,p.public_key,p.counter,p.transports FROM users u JOIN passkeys p ON p.user_id=u.id JOIN tenants t ON t.id=u.tenant_id AND t.status='active' LEFT JOIN tenant_auth_policy a ON a.tenant_id=u.tenant_id WHERE u.email=$1 AND p.id=$2 AND u.status='active' AND u.auth_source='local' AND (a.local_enabled IS NULL OR a.local_enabled=TRUE OR u.role='super_admin')",
      [email.trim().toLowerCase(),response.id]);
    const user=found.rows[0];
    if(!user) return send(res,401,{error:'Passkey sign-in failed'});
    const challenge=(await pool.query("SELECT challenge FROM passkey_challenges WHERE user_id=$1 AND purpose='login' AND expires_at>UTC_TIMESTAMP(3)",[user.id])).rows[0];
    if(!challenge) return send(res,401,{error:'Passkey challenge expired'});
    const consumed=await pool.query("DELETE FROM passkey_challenges WHERE user_id=$1 AND purpose='login' AND challenge=$2 AND expires_at>UTC_TIMESTAMP(3)",[user.id,challenge.challenge]);
    if(!consumed.rowCount) return send(res,401,{error:'Passkey challenge already used'});
    try {
      const verified=await verifyAuthenticationResponse({response,expectedChallenge:challenge.challenge,
        expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,
        credential:{id:user.passkey_id,publicKey:new Uint8Array(user.public_key),counter:Number(user.counter),transports:user.transports}});
      if(!verified.verified) throw new Error('Unverified passkey');
      await pool.query('UPDATE passkeys SET counter=$1 WHERE id=$2 AND user_id=$3',[verified.authenticationInfo.newCounter,user.passkey_id,user.id]);
      const token=createSessionToken();
      await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at,auth_method) VALUES($1,$2,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 7 DAY),'passkey')",[tokenHash(token),user.id]);
      return send(res,200,{id:user.id,name:user.display_name,email:user.email,role:user.role,
        authSource:'local',tenantId:user.tenant_id,features:await featuresFor(user)},
        {'Set-Cookie':sessionCookie(token,604800)});
    } catch(error) {console.error('Passkey login failed',error.name);return send(res,401,{error:'Passkey sign-in failed'});}
  }
  const match=/^\/api\/passkeys\/([A-Za-z0-9_-]{10,512})$/.exec(path);
  if(match && req.method==='DELETE') {
    const user=await currentUser(req);
    if(!user) return send(res,401,{error:'Sign in required'});
    if(await effectivePasskeyMode(pool,user)==='required'){
      const keys=await pool.query('SELECT id FROM passkeys WHERE user_id=$1',[user.id]);
      if(keys.rows.some(k=>k.id===match[1])&&keys.rows.length<=1)return send(res,409,{error:'A required passkey cannot be the last one removed'});
    }
    const result=await pool.query('DELETE FROM passkeys WHERE id=$1 AND user_id=$2',[match[1],user.id]);
    return send(res,result.rowCount?200:404,result.rowCount?{status:'removed'}:{error:'Passkey unavailable'});
  }
  return send(res,404,{error:'Passkey route unavailable'});
}
