// Compatibility exports: the former image CAPTCHA endpoint now issues an invisible, one-use form token.
import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
const digest=v=>createHash('sha256').update(v).digest('hex');
export async function migrateSignupGuard(db){
 await db.query(`CREATE TABLE IF NOT EXISTS signup_guard_tokens(id CHAR(36) PRIMARY KEY,token_hash CHAR(64) NOT NULL,issued_ms BIGINT NOT NULL,expires_ms BIGINT NOT NULL,INDEX guard_expiry(expires_ms)) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS signup_guard_limits(bucket CHAR(64) PRIMARY KEY,attempts INT NOT NULL,expires_ms BIGINT NOT NULL,INDEX guard_limit_expiry(expires_ms)) ENGINE=InnoDB`);
}
async function budget(pool,req,kind,maximum){
 // Use the socket address only; never trust arbitrary forwarded headers. A reverse proxy shares this safety ceiling.
 const now=Date.now(),window=600000,key=digest(kind+':'+(req?.socket?.remoteAddress||'local')+':'+Math.floor(now/window));
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  await db.query('INSERT IGNORE INTO signup_guard_limits(bucket,attempts,expires_ms) VALUES($1,0,$2)',[key,now+window*2]);
  const row=(await db.query('SELECT attempts FROM signup_guard_limits WHERE bucket=$1 FOR UPDATE',[key])).rows[0];
  if(Number(row.attempts)>=maximum){await db.query('ROLLBACK');return false;}
  await db.query('UPDATE signup_guard_limits SET attempts=attempts+1 WHERE bucket=$1',[key]);await db.query('COMMIT');return true;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function issueCaptcha(pool,req){
 if(!await budget(pool,req,'issue',200))throw Object.assign(Error('Too many signup checks. Wait ten minutes before trying again.'),{signupLimited:true});
 await pool.query('DELETE FROM signup_guard_tokens WHERE expires_ms<$1 LIMIT 500',[Date.now()]);
 await pool.query('DELETE FROM signup_guard_limits WHERE expires_ms<$1 LIMIT 500',[Date.now()]);
 const id=randomUUID(),token=randomBytes(32).toString('hex'),now=Date.now();
 await pool.query('INSERT INTO signup_guard_tokens(id,token_hash,issued_ms,expires_ms) VALUES($1,$2,$3,$4)',[id,digest(token),now,now+300000]);
 return {captchaId:id,formToken:token,expiresInSeconds:300,minimumWaitMs:1000};
}
export async function consumeCaptcha(pool,id,token,req){
 if(!/^[a-f0-9-]{36}$/i.test(id||'')||typeof token!=='string'||!(/^[a-f0-9]{64}$/).test(token))return false;
 if(!await budget(pool,req,'submit',50))throw Object.assign(Error('Too many registration attempts. Wait ten minutes before trying again.'),{signupLimited:true});
 const db=await pool.connect();try{
  await db.query('START TRANSACTION');
  const row=(await db.query('SELECT token_hash,issued_ms,expires_ms FROM signup_guard_tokens WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(row)await db.query('DELETE FROM signup_guard_tokens WHERE id=$1',[id]);
  const now=Date.now();const valid=!!row&&now>=Number(row.issued_ms)+1000&&now<Number(row.expires_ms)&&timingSafeEqual(Buffer.from(row.token_hash,'hex'),Buffer.from(digest(token),'hex'));
  await db.query('COMMIT');return valid;
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
