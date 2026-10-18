import {appendServiceEvent} from './serviceCountries.js';
import {webcrypto,createHash} from 'node:crypto';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const b64=(s,min,max)=>typeof s==='string'&&/^[A-Za-z0-9_-]+$/.test(s)&&s.length>=min&&s.length<=max;
export async function validatePublicKey(j){if(!j||Object.keys(j).some(k=>!['kty','crv','x','y'].includes(k))||j.kty!=='EC'||j.crv!=='P-256'||!b64(j.x,43,43)||!b64(j.y,43,43))throw Error('Valid public P-256 key required');await webcrypto.subtle.importKey('jwk',j,{name:'ECDH',namedCurve:'P-256'},true,[]);const key={kty:'EC',crv:'P-256',x:j.x,y:j.y};return {key,fingerprint:createHash('sha256').update(JSON.stringify(key)).digest('hex')};}
export function validateEnvelope(b){if(!b||Object.keys(b).some(k=>!['id','recipientId','senderFingerprint','recipientFingerprint','iv','salt','ciphertext','version'].includes(k))||!uuid.test(b.id)||!uuid.test(b.recipientId)||b.version!==1||!/^[a-f0-9]{64}$/.test(b.senderFingerprint)||!/^[a-f0-9]{64}$/.test(b.recipientFingerprint)||!b64(b.iv,16,16)||!b64(b.salt,22,22)||!b64(b.ciphertext,22,22000))throw Error('Invalid encrypted message envelope');return b;}
export async function migrateSecureChat(db){for(const sql of [
 `CREATE TABLE IF NOT EXISTS secure_chat_keys(user_id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,public_key JSON NOT NULL,fingerprint CHAR(64) NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS secure_chat_messages(sequence_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,id CHAR(36) NOT NULL UNIQUE,tenant_id CHAR(36) NOT NULL,sender_id CHAR(36) NOT NULL,recipient_id CHAR(36) NOT NULL,sender_fingerprint CHAR(64) NOT NULL,recipient_fingerprint CHAR(64) NOT NULL,envelope JSON NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),INDEX secure_thread(tenant_id,sender_id,recipient_id,sequence_id),INDEX secure_recipient(tenant_id,recipient_id,sequence_id)) ENGINE=InnoDB`
 ])await db.query(sql);}
async function peer(db,user,id){if(!uuid.test(id)||id===user.id)return null;return (await db.query("SELECT u.id,u.display_name FROM contacts c JOIN users u ON u.id=c.contact_id AND u.tenant_id=$2 AND u.status='active' WHERE c.owner_id=$1 AND c.contact_id=$3",[user.id,user.tenant_id,id])).rows[0];}
export async function handleSecureChat({req,res,path,user,pool,send,readJson}){
 if(!user.features?.messaging&&!['admin','super_admin'].includes(user.role))return send(res,403,{error:'Messaging unavailable'});
 if(path==='/api/secure-chat/key'){
  if(req.method==='GET')return send(res,200,{key:(await pool.query('SELECT public_key,fingerprint FROM secure_chat_keys WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows[0]||null});
  if(req.method==='PUT'){let v;try{v=await validatePublicKey(await readJson(req));}catch{return send(res,400,{error:'Valid public P-256 key required; private keys must never be uploaded'});}
   await pool.query('INSERT IGNORE INTO secure_chat_keys(user_id,tenant_id,public_key,fingerprint) VALUES($1,$2,$3,$4)',[user.id,user.tenant_id,JSON.stringify(v.key),v.fingerprint]);const saved=(await pool.query('SELECT fingerprint FROM secure_chat_keys WHERE user_id=$1 AND tenant_id=$2',[user.id,user.tenant_id])).rows[0];if(saved?.fingerprint!==v.fingerprint)return send(res,409,{error:'Account encryption key already exists. Import your encrypted key backup on this device.'});return send(res,200,{fingerprint:v.fingerprint});}
 }
 const match=/^\/api\/secure-chat\/peer\/([a-f0-9-]{36})$/i.exec(path);
 if(match&&req.method==='GET'){const p=await peer(pool,user,match[1]);if(!p)return send(res,404,{error:'Active workspace contact required'});const key=(await pool.query('SELECT public_key,fingerprint FROM secure_chat_keys WHERE user_id=$1 AND tenant_id=$2',[p.id,user.tenant_id])).rows[0]||null;return send(res,200,{peer:p,key});}
 if(path==='/api/secure-chat/messages'&&req.method==='GET'){
  const url=new URL(req.url,'http://localhost'),id=url.searchParams.get('peer'),before=url.searchParams.get('before')||'18446744073709551615';if(!/^\d{1,20}$/.test(before)||!await peer(pool,user,id))return send(res,404,{error:'Active workspace contact required'});
  const messages=(await pool.query('SELECT sequence_id,id,sender_id,recipient_id,envelope,created_at FROM secure_chat_messages WHERE tenant_id=$1 AND sequence_id<$2 AND ((sender_id=$3 AND recipient_id=$4) OR (sender_id=$4 AND recipient_id=$3)) ORDER BY sequence_id DESC LIMIT 50',[user.tenant_id,before,user.id,id])).rows;
  return send(res,200,{messages,nextBefore:messages.length===50?String(messages.at(-1).sequence_id):null});
 }
 if(path==='/api/secure-chat/messages'&&req.method==='POST'){
  let b;try{b=validateEnvelope(await readJson(req));}catch(e){return send(res,400,{error:e.message});}if(!await peer(pool,user,b.recipientId))return send(res,404,{error:'Active workspace contact required'});
  const db=await pool.connect();try{await db.query('START TRANSACTION');const keys=(await db.query('SELECT user_id,fingerprint FROM secure_chat_keys WHERE tenant_id=$1 AND user_id IN ($2,$3) ORDER BY user_id FOR UPDATE',[user.tenant_id,user.id,b.recipientId])).rows;
   if(keys.find(k=>k.user_id===user.id)?.fingerprint!==b.senderFingerprint||keys.find(k=>k.user_id===b.recipientId)?.fingerprint!==b.recipientFingerprint){await db.query('ROLLBACK');return send(res,409,{error:'Encryption keys unavailable or changed; refresh and verify contact fingerprints'});}
   const envelope={...b,senderId:user.id};await db.query('INSERT INTO secure_chat_messages(id,tenant_id,sender_id,recipient_id,sender_fingerprint,recipient_fingerprint,envelope) VALUES($1,$2,$3,$4,$5,$6,$7)',[b.id,user.tenant_id,user.id,b.recipientId,b.senderFingerprint,b.recipientFingerprint,JSON.stringify(envelope)]);await appendServiceEvent(db,user.tenant_id,user.id,user.id,'encrypted_message_sent',{messageId:b.id,recipientId:b.recipientId});await db.query('COMMIT');return send(res,201,{id:b.id});
  }catch(e){await db.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY')return send(res,409,{error:'Message ID already used; refresh conversation before retrying'});throw e;}finally{db.release();}
 }return send(res,405,{error:'Unsupported encrypted messaging action'});
}
