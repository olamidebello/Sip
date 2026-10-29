import {validateMessagePrivacy} from './messagePrivacy.js';
import {randomUUID} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const reactions=['👍','❤️','😂','😮','😢','🙏'];
export async function migrateConversations(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS personal_address_book (
    id CHAR(36) PRIMARY KEY,owner_id CHAR(36) NOT NULL,name VARCHAR(160) NOT NULL,email VARCHAR(254) NOT NULL DEFAULT '',
    phone VARCHAR(64) NOT NULL DEFAULT '', FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY owner_contact(owner_id,email,phone)) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_presence (
    user_id CHAR(36) PRIMARY KEY, searchable BOOLEAN NOT NULL DEFAULT TRUE,
    presence VARCHAR(16) NOT NULL DEFAULT 'available', status_text VARCHAR(160) NOT NULL DEFAULT '',
    share_presence BOOLEAN NOT NULL DEFAULT TRUE, accept_forwarded BOOLEAN NOT NULL DEFAULT FALSE,
    call_forward CHAR(36) NULL, message_forward CHAR(36) NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
  for(const [name,definition] of [['reply_to','CHAR(36) NULL'],['read_at','DATETIME(3) NULL'],['edited_at','DATETIME(3) NULL'],['deleted_at','DATETIME(3) NULL']]) {
    const found=await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='messages' AND column_name=$1",[name]);
    if(!found.rowCount)await pool.query(`ALTER TABLE messages ADD COLUMN ${name} ${definition}`);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS conversation_preferences (
    owner_id CHAR(36) NOT NULL,contact_id CHAR(36) NOT NULL,blocked BOOLEAN NOT NULL DEFAULT FALSE,
    muted BOOLEAN NOT NULL DEFAULT FALSE,archived BOOLEAN NOT NULL DEFAULT FALSE,typing_until DATETIME(3) NULL,
    PRIMARY KEY(owner_id,contact_id),FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(contact_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS message_reactions (
    message_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,reaction VARCHAR(16) NOT NULL,
    PRIMARY KEY(message_id,user_id),FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);
}
export async function conversationContact(pool,user,contact) {
  if(!uuid.test(contact||'')||contact===user.id)return false;
  return (await pool.query(`SELECT 1 FROM contacts c JOIN users u ON u.id=c.contact_id
    WHERE c.owner_id=$1 AND c.contact_id=$2 AND u.tenant_id=$3 AND u.status='active'`,[user.id,contact,user.tenant_id])).rowCount>0;
}
export async function handleConversations({req,res,path,user,pool,send,readJson,url}) {
  if(!user.features?.messaging)return send(res,403,{error:'Messaging unavailable for your groups'});
  if(path==='/api/messages/read-all'&&req.method==='POST'){
    const result=await pool.query(`UPDATE messages m JOIN users sender ON sender.id=m.sender_id JOIN contacts c ON c.owner_id=m.recipient_id AND c.contact_id=m.sender_id SET m.read_at=UTC_TIMESTAMP(3) WHERE m.recipient_id=$1 AND sender.tenant_id=$2 AND m.read_at IS NULL AND m.deleted_at IS NULL`,[user.id,user.tenant_id]);
    return send(res,200,{updated:result.rowCount});
  }

  if(path==='/api/messages' && req.method==='GET') {
    const contact=url.searchParams.get('contact');
    if(!await conversationContact(pool,user,contact))return send(res,403,{error:'Add an active workspace contact first'});
    const messages=await pool.query(`SELECT m.id,m.sender_id AS sender,m.recipient_id AS recipient,
      CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END AS body,m.created_at,m.expires_at,m.view_once,m.opened_at,m.reply_to,m.read_at,m.edited_at,m.deleted_at,m.attachment_id,a.name AS attachment_name,a.mime AS attachment_mime,EXISTS(SELECT 1 FROM message_stars stars WHERE stars.user_id=$1 AND stars.message_id=m.id) AS starred,
      CASE WHEN r.deleted_at IS NULL AND r.view_once=FALSE AND (r.expires_at IS NULL OR r.expires_at>UTC_TIMESTAMP(3)) THEN r.body ELSE '' END AS reply_body
      FROM messages m LEFT JOIN messenger_attachments a ON a.id=m.attachment_id LEFT JOIN messages r ON r.id=m.reply_to AND ((r.sender_id=m.sender_id AND r.recipient_id=m.recipient_id) OR (r.sender_id=m.recipient_id AND r.recipient_id=m.sender_id))
      WHERE NOT EXISTS (SELECT 1 FROM subscriber_sms_deliveries sms_copy WHERE sms_copy.id=m.id) AND ((m.sender_id=$1 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$1)) AND (m.expires_at IS NULL OR m.expires_at>UTC_TIMESTAMP(3))
      ORDER BY m.created_at DESC,m.id DESC LIMIT 100`,[user.id,contact]);
    const prefs=(await pool.query(`SELECT owner_id,blocked,muted,archived,pinned,unread,typing_until>NOW(3) AS typing
      FROM conversation_preferences WHERE (owner_id=$1 AND contact_id=$2) OR (owner_id=$2 AND contact_id=$1)`,[user.id,contact])).rows;
    const reactionRows=(await pool.query(`SELECT r.message_id,r.user_id,r.reaction FROM message_reactions r JOIN messages m ON m.id=r.message_id
      WHERE NOT EXISTS (SELECT 1 FROM subscriber_sms_deliveries sms_copy WHERE sms_copy.id=m.id) AND ((m.sender_id=$1 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$1)) AND m.deleted_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>UTC_TIMESTAMP(3))
      ORDER BY m.created_at DESC LIMIT 200`,[user.id,contact])).rows;
    const own=prefs.find(p=>p.owner_id===user.id),other=prefs.find(p=>p.owner_id===contact);
    return send(res,200,{viewer:user.id,messages:messages.rows.reverse(),reactions:reactionRows,
      preferences:{blocked:!!own?.blocked,muted:!!own?.muted,archived:!!own?.archived,pinned:!!own?.pinned,unread:!!own?.unread},typing:!own?.blocked&&!other?.blocked&&!!other?.typing});
  }
  if(path==='/api/messages' && req.method==='POST') {
    const input=await readJson(req);const {recipient,body,replyTo=null,attachmentId=null}=input;let privacy;try{privacy=validateMessagePrivacy(input);}catch(error){return send(res,400,{error:error.message});}if(privacy.viewOnce&&!attachmentId)return send(res,400,{error:'Attach fresh image, video or audio for view once'});
    if(typeof body!=='string'||!body.trim()||body.length>4000||(attachmentId!==null&&!uuid.test(attachmentId))||(replyTo!==null&&!uuid.test(replyTo)))return send(res,400,{error:'Message required (up to 4000 characters)'});
    if(!await conversationContact(pool,user,recipient))return send(res,403,{error:'Add an active workspace contact first'});
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      for(const id of [user.id,recipient].sort())await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[id]);
      const recent=await db.query('SELECT COUNT(*) AS total FROM messages WHERE sender_id=$1 AND created_at>DATE_SUB(NOW(3),INTERVAL 1 MINUTE)',[user.id]);
      if(Number(recent.rows[0]?.total||0)>=60){await db.query('ROLLBACK');return send(res,429,{error:'Please wait before sending more messages'});}
      const blocked=await db.query(`SELECT 1 FROM conversation_preferences WHERE blocked=true AND
        ((owner_id=$1 AND contact_id=$2) OR (owner_id=$2 AND contact_id=$1))`,[user.id,recipient]);
      if(blocked.rowCount){await db.query('ROLLBACK');return send(res,403,{error:'Messaging is unavailable for this conversation'});}
      if(replyTo && !(await db.query(`SELECT 1 FROM messages WHERE id=$3 AND deleted_at IS NULL AND view_once=FALSE AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP(3)) AND
        ((sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1))`,[user.id,recipient,replyTo])).rowCount){
        await db.query('ROLLBACK');return send(res,400,{error:'Reply message unavailable'});
      }
      if(attachmentId && !(await db.query('SELECT 1 FROM messenger_attachments WHERE id=$1 AND owner_id=$2 AND tenant_id=$3 AND restricted=FALSE',[attachmentId,user.id,user.tenant_id])).rowCount){await db.query('ROLLBACK');return send(res,400,{error:'Attachment unavailable'});}
      if(privacy.viewOnce){const fresh=await db.query(`SELECT id FROM messenger_attachments a WHERE a.id=$1 AND a.owner_id=$2 AND a.tenant_id=$3 AND a.restricted=FALSE AND (a.mime LIKE 'image/%' OR a.mime LIKE 'video/%' OR a.mime LIKE 'audio/%') AND NOT EXISTS(SELECT 1 FROM messages WHERE attachment_id=a.id) AND NOT EXISTS(SELECT 1 FROM messenger_group_messages WHERE attachment_id=a.id) AND NOT EXISTS(SELECT 1 FROM messenger_status WHERE attachment_id=a.id) FOR UPDATE`,[attachmentId,user.id,user.tenant_id]);if(!fresh.rowCount){await db.query('ROLLBACK');return send(res,400,{error:'View once requires a fresh unshared media upload'});}await db.query('UPDATE messenger_attachments SET restricted=TRUE WHERE id=$1',[attachmentId]);}
      const id=randomUUID();
      await db.query('INSERT INTO messages(id,sender_id,recipient_id,body,reply_to) VALUES($1,$2,$3,$4,$5)',[id,user.id,recipient,body.trim(),replyTo]);
      await db.query('UPDATE messages SET view_once=$2,expires_at=IF($3=0,NULL,TIMESTAMPADD(SECOND,$3,UTC_TIMESTAMP(3))) WHERE id=$1',[id,privacy.viewOnce,privacy.expiresIn]);
      if(attachmentId)await db.query('UPDATE messages SET attachment_id=$2 WHERE id=$1',[id,attachmentId]);
      const forwarding=(await db.query('SELECT message_forward FROM user_presence WHERE user_id=$1',[recipient])).rows[0]?.message_forward;
      if(!privacy.viewOnce && !privacy.expiresIn && forwarding && forwarding!==user.id && forwarding!==recipient) {
        const destination=await db.query(`SELECT u.id FROM users u JOIN user_presence p ON p.user_id=u.id
          JOIN contacts c ON c.contact_id=u.id AND c.owner_id=$1
          WHERE u.id=$2 AND u.tenant_id=$3 AND u.status='active' AND p.accept_forwarded=true`,[recipient,forwarding,user.tenant_id]);
        const denied=await db.query(`SELECT 1 FROM conversation_preferences WHERE blocked=true AND
          ((owner_id=$1 AND contact_id=$2) OR (owner_id=$2 AND contact_id=$1))`,[user.id,forwarding]);
        if(destination.rowCount&&!denied.rowCount){
          await db.query('INSERT IGNORE INTO contacts(owner_id,contact_id) VALUES($1,$2)',[forwarding,user.id]);
          await db.query('INSERT INTO messages(id,sender_id,recipient_id,body) VALUES($1,$2,$3,$4)',[randomUUID(),user.id,forwarding,'[Forwarded account message]\n'+body.trim()]);
        }
      }
      await db.query('COMMIT');return send(res,201,{id,status:'sent'});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  const thread=/^\/api\/messages\/conversation\/([0-9a-f-]{36})$/.exec(path);
  if(thread&&req.method==='PUT') {
    const contact=thread[1],input=await readJson(req);
    if(!await conversationContact(pool,user,contact))return send(res,403,{error:'Conversation unavailable'});
    if(Object.keys(input).some(key=>!['blocked','muted','archived','pinned','unread','typing','read'].includes(key))||Object.values(input).some(value=>typeof value!=='boolean'))return send(res,400,{error:'Boolean conversation controls required'});
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      for(const id of [user.id,contact].sort())await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[id]);
      await db.query('INSERT IGNORE INTO conversation_preferences(owner_id,contact_id) VALUES($1,$2)',[user.id,contact]);
      for(const key of ['blocked','muted','archived','pinned','unread'])if(key in input)await db.query(`UPDATE conversation_preferences SET ${key}=$3 WHERE owner_id=$1 AND contact_id=$2`,[user.id,contact,input[key]]);
      if('typing' in input)await db.query(`UPDATE conversation_preferences SET typing_until=${input.typing?'DATE_ADD(NOW(3),INTERVAL 8 SECOND)':'NULL'} WHERE owner_id=$1 AND contact_id=$2`,[user.id,contact]);
      if(input.read)await db.query('UPDATE conversation_preferences SET unread=FALSE WHERE owner_id=$1 AND contact_id=$2',[user.id,contact]);
      if(input.read)await db.query('UPDATE messages SET read_at=COALESCE(read_at,NOW(3)) WHERE sender_id=$1 AND recipient_id=$2',[contact,user.id]);
      await db.query('COMMIT');return send(res,200,{status:'saved'});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  const message=/^\/api\/messages\/([0-9a-f-]{36})$/.exec(path);
  if(message&&['PATCH','DELETE','PUT'].includes(req.method)) {
    const row=(await pool.query(`SELECT m.sender_id,m.recipient_id,m.deleted_at,m.view_once FROM messages m
      JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id
      WHERE m.id=$1 AND s.tenant_id=$3 AND r.tenant_id=$3 AND (m.sender_id=$2 OR m.recipient_id=$2) AND (m.expires_at IS NULL OR m.expires_at>UTC_TIMESTAMP(3))`,[message[1],user.id,user.tenant_id])).rows[0];
    if(!row||row.deleted_at||row.view_once)return send(res,404,{error:'Message unavailable'});
    if(req.method==='PUT') {
      const {reaction}=await readJson(req);
      if(!reactions.includes(reaction)&&reaction!==null)return send(res,400,{error:'Choose a supported reaction'});
      if(reaction===null)await pool.query('DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2',[message[1],user.id]);
      else await pool.query('INSERT INTO message_reactions(message_id,user_id,reaction) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE reaction=VALUES(reaction)',[message[1],user.id,reaction]);
    }else{
      if(row.sender_id!==user.id)return send(res,403,{error:'Only the sender can change a message'});
      if(req.method==='DELETE')await pool.query("UPDATE messages SET body='Message removed',deleted_at=NOW(3) WHERE id=$1 AND sender_id=$2",[message[1],user.id]);
      else {
        const {body}=await readJson(req);
        if(typeof body!=='string'||!body.trim()||body.length>4000)return send(res,400,{error:'Message required (up to 4000 characters)'});
        await pool.query('UPDATE messages SET body=$3,edited_at=NOW(3) WHERE id=$1 AND sender_id=$2 AND deleted_at IS NULL',[message[1],user.id,body.trim()]);
      }
    }
    return send(res,200,{status:'saved'});
  }
  return send(res,404,{error:'Message route unavailable'});
}
