import {randomUUID} from 'node:crypto';
import {conversationContact} from './conversations.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function migrateMessengerFeatures(pool){
 for(const [table,name,definition] of [['conversation_preferences','pinned','BOOLEAN NOT NULL DEFAULT FALSE'],['conversation_preferences','unread','BOOLEAN NOT NULL DEFAULT FALSE'],['messages','attachment_id','CHAR(36) NULL']]){
  const exists=await pool.query('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=$1 AND column_name=$2',[table,name]);
  if(!exists.rowCount)await pool.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
 }
 const statements=[
 `CREATE TABLE IF NOT EXISTS messenger_attachments(id CHAR(36) PRIMARY KEY,owner_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,name VARCHAR(160) NOT NULL,mime VARCHAR(80) NOT NULL,size INT NOT NULL,data MEDIUMBLOB NOT NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE,INDEX attachment_owner(owner_id)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS message_stars(user_id CHAR(36) NOT NULL,message_id CHAR(36) NOT NULL,PRIMARY KEY(user_id,message_id),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS messenger_groups(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,owner_id CHAR(36) NOT NULL,name VARCHAR(100) NOT NULL,kind VARCHAR(16) NOT NULL DEFAULT 'group',closed BOOLEAN NOT NULL DEFAULT FALSE,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(owner_id) REFERENCES users(id),INDEX group_tenant(tenant_id)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS messenger_members(group_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY(group_id,user_id),FOREIGN KEY(group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS messenger_group_messages(id CHAR(36) PRIMARY KEY,group_id CHAR(36) NOT NULL,sender_id CHAR(36) NOT NULL,body TEXT NOT NULL,attachment_id CHAR(36) NULL,deleted_at DATETIME(3) NULL,edited_at DATETIME(3) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(group_id) REFERENCES messenger_groups(id) ON DELETE CASCADE,FOREIGN KEY(sender_id) REFERENCES users(id),INDEX group_message_order(group_id,created_at)) ENGINE=InnoDB`,
 `CREATE TABLE IF NOT EXISTS messenger_status(id CHAR(36) PRIMARY KEY,owner_id CHAR(36) NOT NULL,tenant_id CHAR(36) NOT NULL,body VARCHAR(700) NOT NULL,attachment_id CHAR(36) NULL,audience VARCHAR(16) NOT NULL DEFAULT 'contacts',created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),expires_at DATETIME(3) NOT NULL,FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE,INDEX status_expiry(expires_at)) ENGINE=InnoDB`
 ];for(const sql of statements)await pool.query(sql);
}
export function validateAttachment(input){
 const name=typeof input.name==='string'?input.name.replace(/[\x00-\x1f/\\]/g,'_').trim():'';
 const mime=String(input.mime||'').split(';')[0].toLowerCase();
 if(!name||name.length>160||typeof input.data!=='string'||input.data.length>2800000||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data))throw new Error('Valid filename and base64 file required');
 const data=Buffer.from(input.data,'base64');if(!data.length||data.length>2*1024*1024)throw new Error('File limit is 2 MB');
 const hex=data.subarray(0,12).toString('hex'),ascii=data.subarray(0,12).toString('ascii');
 const matches={
  'image/png':hex.startsWith('89504e470d0a1a0a'),'image/jpeg':hex.startsWith('ffd8ff'),'image/gif':ascii.startsWith('GIF87a')||ascii.startsWith('GIF89a'),
  'image/webp':ascii.startsWith('RIFF')&&ascii.slice(8)==='WEBP','audio/ogg':ascii.startsWith('OggS'),'audio/webm':hex.startsWith('1a45dfa3'),'video/webm':hex.startsWith('1a45dfa3'),
  'audio/mp4':ascii.slice(4,8)==='ftyp','video/mp4':ascii.slice(4,8)==='ftyp','application/pdf':ascii.startsWith('%PDF-')
 };
 if(!matches[mime])throw new Error('Supported files: PNG, JPEG, GIF, WebP, WebM, Ogg, MP4 or PDF with matching file content');
 return {name,mime,data,size:data.length};
}
async function allowedAttachment(pool,user,id){return id===null||uuid.test(id)&&!!(await pool.query('SELECT 1 FROM messenger_attachments WHERE id=$1 AND owner_id=$2 AND tenant_id=$3',[id,user.id,user.tenant_id])).rowCount;}
async function groupAccess(pool,user,id,lock=false){return (await pool.query(`SELECT g.* FROM messenger_groups g JOIN messenger_members m ON m.group_id=g.id WHERE g.id=$1 AND m.user_id=$2 AND g.tenant_id=$3 AND g.closed=FALSE${lock?' FOR UPDATE':''}`,[id,user.id,user.tenant_id])).rows[0];}
async function sourceMessage(pool,user,id){return (await pool.query(`SELECT m.*,CASE WHEN m.sender_id=$2 THEN m.recipient_id ELSE m.sender_id END AS contact_id FROM messages m JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id WHERE m.id=$1 AND (m.sender_id=$2 OR m.recipient_id=$2) AND s.tenant_id=$3 AND r.tenant_id=$3 AND m.deleted_at IS NULL`,[id,user.id,user.tenant_id])).rows[0];}
async function sendCopies(pool,user,recipients,body,attachmentId=null){
 const db=await pool.connect();try{
  await db.query('BEGIN');for(const id of [...new Set([user.id,...recipients])].sort())await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[id]);
  const recent=await db.query('SELECT COUNT(*) AS total FROM messages WHERE sender_id=$1 AND created_at>DATE_SUB(NOW(3),INTERVAL 1 MINUTE)',[user.id]);
  if(Number(recent.rows[0]?.total||0)+recipients.length>60)throw new Error('Please wait before sending more messages');
  for(const recipient of recipients){
   if(!await conversationContact(db,user,recipient))throw new Error('Every recipient must be an active workspace contact');
   const blocked=await db.query('SELECT 1 FROM conversation_preferences WHERE blocked=TRUE AND ((owner_id=$1 AND contact_id=$2) OR (owner_id=$2 AND contact_id=$1))',[user.id,recipient]);
   if(blocked.rowCount)throw new Error('A selected conversation is blocked');
   await db.query('INSERT IGNORE INTO contacts(owner_id,contact_id) VALUES($1,$2)',[recipient,user.id]);
   await db.query('INSERT INTO messages(id,sender_id,recipient_id,body,attachment_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.id,recipient,body,attachmentId]);
  }await db.query('COMMIT');return recipients.length;
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
export async function handleMessengerFeatures({req,res,path,user,pool,send,readJson,url,sessionHash,closeSessions}){
 if(path==='/api/account/sessions'&&req.method==='GET'){
  const sessions=await pool.query('SELECT token_hash AS id,created_at,expires_at,auth_method,token_hash=$2 AS current FROM sessions WHERE user_id=$1 AND expires_at>UTC_TIMESTAMP(3) ORDER BY created_at DESC',[user.id,sessionHash]);
  return send(res,200,{sessions:sessions.rows});
 }
 const session=/^\/api\/account\/sessions\/([a-f0-9]{64})$/.exec(path);
 if(session&&req.method==='DELETE'){
  const removed=await pool.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash=$2',[user.id,session[1]]);if(removed.rowCount)closeSessions?.([session[1]]);return send(res,200,{status:'session_ended'});
 }
 if(!user.features?.messaging)return send(res,403,{error:'Messaging unavailable for this account'});
 if(path==='/api/messenger/attachments'&&req.method==='POST'){
  let file;try{file=validateAttachment(await readJson(req,2900000));}catch(error){return send(res,400,{error:error.message});}
  const db=await pool.connect();try{await db.query('BEGIN');await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
   const used=await db.query('SELECT COALESCE(SUM(size),0) AS total FROM messenger_attachments WHERE owner_id=$1',[user.id]);
   if(Number(used.rows[0]?.total||0)+file.size>20*1024*1024){await db.query('ROLLBACK');return send(res,413,{error:'Attachment storage limit is 20 MB per user'});}
   const id=randomUUID();await db.query('INSERT INTO messenger_attachments(id,owner_id,tenant_id,name,mime,size,data) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,user.id,user.tenant_id,file.name,file.mime,file.size,file.data]);await db.query('COMMIT');return send(res,201,{id,name:file.name,mime:file.mime,size:file.size});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 if(path==='/api/messenger/storage'&&req.method==='GET'){
  const files=await pool.query('SELECT id,name,mime,size,created_at FROM messenger_attachments WHERE owner_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 500',[user.id,user.tenant_id]);
  const used=await pool.query('SELECT COALESCE(SUM(size),0) AS total FROM messenger_attachments WHERE owner_id=$1',[user.id]);return send(res,200,{files:files.rows,usedBytes:Number(used.rows[0]?.total||0),limitBytes:20*1024*1024});
 }
 const attachment=/^\/api\/messenger\/attachments\/([0-9a-f-]{36})$/.exec(path);
 if(attachment&&uuid.test(attachment[1])&&req.method==='DELETE'){await pool.query('DELETE FROM messenger_attachments WHERE id=$1 AND owner_id=$2 AND tenant_id=$3',[attachment[1],user.id,user.tenant_id]);return send(res,200,{status:'removed'});}
 if(attachment&&uuid.test(attachment[1])&&req.method==='GET'){
  const row=(await pool.query(`SELECT a.* FROM messenger_attachments a WHERE a.id=$1 AND a.tenant_id=$3 AND (a.owner_id=$2 OR
    EXISTS(SELECT 1 FROM messages m WHERE m.attachment_id=a.id AND m.deleted_at IS NULL AND (m.sender_id=$2 OR m.recipient_id=$2)) OR
    EXISTS(SELECT 1 FROM messenger_group_messages gm JOIN messenger_members mm ON mm.group_id=gm.group_id JOIN messenger_groups g ON g.id=gm.group_id WHERE gm.attachment_id=a.id AND gm.deleted_at IS NULL AND mm.user_id=$2 AND g.tenant_id=$3 AND g.closed=FALSE) OR
    EXISTS(SELECT 1 FROM messenger_status st JOIN contacts c ON c.owner_id=st.owner_id AND c.contact_id=$2 JOIN contacts back ON back.owner_id=$2 AND back.contact_id=st.owner_id WHERE st.attachment_id=a.id AND st.audience='contacts' AND st.expires_at>UTC_TIMESTAMP(3)))`,[attachment[1],user.id,user.tenant_id])).rows[0];
  if(!row)return send(res,404,{error:'Attachment unavailable'});
  res.writeHead(200,{'Content-Type':row.mime,'Content-Length':row.size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':(row.mime==='application/pdf'?'attachment':'inline')+`; filename="attachment"; filename*=UTF-8''${encodeURIComponent(row.name)}`});res.end(row.data);return;
 }
 if(path==='/api/messenger/starred'&&req.method==='GET'){
  const result=await pool.query(`SELECT m.id,m.body,m.created_at,CASE WHEN m.sender_id=$1 THEN m.recipient_id ELSE m.sender_id END AS contact_id FROM message_stars star JOIN messages m ON m.id=star.message_id JOIN users s ON s.id=m.sender_id JOIN users r ON r.id=m.recipient_id WHERE star.user_id=$1 AND (m.sender_id=$1 OR m.recipient_id=$1) AND s.tenant_id=$2 AND r.tenant_id=$2 AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 200`,[user.id,user.tenant_id]);return send(res,200,{messages:result.rows});
 }
 const message=/^\/api\/messenger\/messages\/([0-9a-f-]{36})\/(star|forward)$/.exec(path);
 if(message&&uuid.test(message[1])){
  const source=await sourceMessage(pool,user,message[1]);if(!source)return send(res,404,{error:'Message unavailable'});
  const input=await readJson(req);
  if(message[2]==='star'&&req.method==='PUT'){
   if(typeof input.starred!=='boolean')return send(res,400,{error:'Boolean starred value required'});
   if(input.starred)await pool.query('INSERT IGNORE INTO message_stars(user_id,message_id) VALUES($1,$2)',[user.id,message[1]]);else await pool.query('DELETE FROM message_stars WHERE user_id=$1 AND message_id=$2',[user.id,message[1]]);return send(res,200,{starred:input.starred});
  }
  if(message[2]==='forward'&&req.method==='POST'){
   if(!uuid.test(input.recipient||''))return send(res,400,{error:'Choose a contact'});
   try{await sendCopies(pool,user,[input.recipient],'[Forwarded]\n'+source.body.slice(0,3988),source.attachment_id);return send(res,201,{status:'forwarded'});}catch(error){return send(res,400,{error:error.message});}
  }
 }
 if(path==='/api/messenger/broadcast'&&req.method==='POST'){
  const {recipients,body}=await readJson(req);if(!Array.isArray(recipients)||!recipients.length||recipients.length>20||new Set(recipients).size!==recipients.length||recipients.some(id=>!uuid.test(id))||typeof body!=='string'||!body.trim()||body.length>4000)return send(res,400,{error:'Choose 1 to 20 distinct contacts and a message up to 4000 characters'});
  try{return send(res,201,{sent:await sendCopies(pool,user,recipients,body.trim())});}catch(error){return send(res,400,{error:error.message});}
 }
 if(path==='/api/messenger/groups'&&req.method==='GET'){
  const groups=await pool.query('SELECT g.id,g.name,g.kind,g.owner_id,(SELECT COUNT(*) FROM messenger_members allm WHERE allm.group_id=g.id) AS members FROM messenger_groups g JOIN messenger_members m ON m.group_id=g.id WHERE m.user_id=$1 AND g.tenant_id=$2 AND g.closed=FALSE ORDER BY g.created_at DESC LIMIT 200',[user.id,user.tenant_id]);return send(res,200,{groups:groups.rows});
 }
 if(path==='/api/messenger/groups'&&req.method==='POST'){
  const {name,kind='group',members=[]}=await readJson(req);if(typeof name!=='string'||!name.trim()||name.length>100||!['group','community'].includes(kind)||!Array.isArray(members)||members.length>49||new Set(members).size!==members.length||members.some(id=>!uuid.test(id)||id===user.id))return send(res,400,{error:'Group name and up to 49 distinct contacts required'});
  const db=await pool.connect();try{await db.query('BEGIN');for(const member of members)if(!await conversationContact(db,user,member)){await db.query('ROLLBACK');return send(res,403,{error:'Members must be active workspace contacts'});}
   const id=randomUUID();await db.query('INSERT INTO messenger_groups(id,tenant_id,owner_id,name,kind) VALUES($1,$2,$3,$4,$5)',[id,user.tenant_id,user.id,name.trim(),kind]);for(const member of [user.id,...members])await db.query('INSERT INTO messenger_members(group_id,user_id) VALUES($1,$2)',[id,member]);await db.query('COMMIT');return send(res,201,{id});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 const groupMessage=/^\/api\/messenger\/groups\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})$/.exec(path);
 if(groupMessage&&uuid.test(groupMessage[1])&&uuid.test(groupMessage[2])&&['PATCH','DELETE'].includes(req.method)){
  const db=await pool.connect();try{await db.query('BEGIN');const group=await groupAccess(db,user,groupMessage[1],true);if(!group){await db.query('ROLLBACK');return send(res,404,{error:'Group unavailable'});}
   const source=(await db.query('SELECT sender_id FROM messenger_group_messages WHERE id=$1 AND group_id=$2 AND deleted_at IS NULL FOR UPDATE',[groupMessage[2],groupMessage[1]])).rows[0];
   if(!source||source.sender_id!==user.id){await db.query('ROLLBACK');return send(res,403,{error:'Only the sender can edit or remove this message'});}
   if(req.method==='DELETE')await db.query("UPDATE messenger_group_messages SET body='',deleted_at=UTC_TIMESTAMP(3),attachment_id=NULL WHERE id=$1",[groupMessage[2]]);
   else{const {body}=await readJson(req);if(typeof body!=='string'||!body.trim()||body.length>4000){await db.query('ROLLBACK');return send(res,400,{error:'Message up to 4000 characters required'});}await db.query('UPDATE messenger_group_messages SET body=$2,edited_at=UTC_TIMESTAMP(3) WHERE id=$1',[groupMessage[2],body.trim()]);}
   await db.query('COMMIT');return send(res,200,{status:'saved'});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 const group=/^\/api\/messenger\/groups\/([0-9a-f-]{36})(?:\/(messages|members|leave|close))?$/.exec(path);
 if(group&&uuid.test(group[1])){
  const id=group[1],action=group[2];
  if(req.method==='GET'){
   const record=await groupAccess(pool,user,id);if(!record)return send(res,404,{error:'Group unavailable'});
   if(action==='messages'){
    const messages=await pool.query(`SELECT gm.id,CASE WHEN gm.deleted_at IS NULL THEN gm.body ELSE 'Message removed' END AS body,gm.deleted_at,gm.edited_at,gm.sender_id,u.display_name AS sender_name,gm.created_at,CASE WHEN gm.deleted_at IS NULL THEN a.id ELSE NULL END AS attachment_id,a.name AS attachment_name,a.mime AS attachment_mime FROM messenger_group_messages gm JOIN users u ON u.id=gm.sender_id LEFT JOIN messenger_attachments a ON a.id=gm.attachment_id WHERE gm.group_id=$1 ORDER BY gm.created_at DESC,gm.id DESC LIMIT 100`,[id]);return send(res,200,{viewer:user.id,group:record,messages:messages.rows.reverse()});
   }
   if(!action){const members=await pool.query('SELECT u.id,u.display_name AS name,u.email FROM messenger_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1 ORDER BY u.display_name',[id]);return send(res,200,{group:record,members:members.rows,viewer:user.id});}
  }
  const db=await pool.connect();try{await db.query('BEGIN');const record=await groupAccess(db,user,id,true);if(!record){await db.query('ROLLBACK');return send(res,404,{error:'Group unavailable'});}
   if(action==='messages'&&req.method==='POST'){
    const {body,attachmentId=null}=await readJson(req);if(typeof body!=='string'||!body.trim()||body.length>4000||!await allowedAttachment(db,user,attachmentId)){await db.query('ROLLBACK');return send(res,400,{error:'Message and owned attachment required'});}
    if(record.kind==='community'&&record.owner_id!==user.id){await db.query('ROLLBACK');return send(res,403,{error:'Only the community owner can announce'});}
    const count=await db.query('SELECT COUNT(*) AS total FROM messenger_group_messages WHERE sender_id=$1 AND created_at>DATE_SUB(NOW(3),INTERVAL 1 MINUTE)',[user.id]);if(Number(count.rows[0]?.total||0)>=60){await db.query('ROLLBACK');return send(res,429,{error:'Please wait before sending more messages'});}
    await db.query('INSERT INTO messenger_group_messages(id,group_id,sender_id,body,attachment_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),id,user.id,body.trim(),attachmentId]);
   }else if(action==='leave'&&req.method==='POST'){
    if(record.owner_id===user.id){await db.query('ROLLBACK');return send(res,409,{error:'Transfer ownership or close the group before leaving'});}await db.query('DELETE FROM messenger_members WHERE group_id=$1 AND user_id=$2',[id,user.id]);
   }else if(record.owner_id===user.id&&action==='close'&&req.method==='POST')await db.query('UPDATE messenger_groups SET closed=TRUE WHERE id=$1',[id]);
   else if(record.owner_id===user.id&&action==='members'&&req.method==='PUT'){
    const {memberId,operation}=await readJson(req);if(!uuid.test(memberId||'')||!['add','remove','transfer'].includes(operation)||memberId===user.id){await db.query('ROLLBACK');return send(res,400,{error:'Choose another contact and a member operation'});}
    if(operation==='add'){
     const count=await db.query('SELECT COUNT(*) AS total FROM messenger_members WHERE group_id=$1',[id]);if(Number(count.rows[0]?.total||0)>=50||!await conversationContact(db,user,memberId)){await db.query('ROLLBACK');return send(res,400,{error:'Group limit is 50 active workspace contacts'});}await db.query('INSERT IGNORE INTO messenger_members(group_id,user_id) VALUES($1,$2)',[id,memberId]);
    }else if(operation==='remove')await db.query('DELETE FROM messenger_members WHERE group_id=$1 AND user_id=$2',[id,memberId]);
    else{const member=await db.query('SELECT 1 FROM messenger_members WHERE group_id=$1 AND user_id=$2',[id,memberId]);if(!member.rowCount){await db.query('ROLLBACK');return send(res,400,{error:'Owner must be an existing member'});}await db.query('UPDATE messenger_groups SET owner_id=$2 WHERE id=$1',[id,memberId]);}
   }else if(record.owner_id===user.id&&!action&&req.method==='PATCH'){
    const {name}=await readJson(req);if(typeof name!=='string'||!name.trim()||name.length>100){await db.query('ROLLBACK');return send(res,400,{error:'Name must be 1 to 100 characters'});}await db.query('UPDATE messenger_groups SET name=$2 WHERE id=$1',[id,name.trim()]);
   }else{await db.query('ROLLBACK');return send(res,403,{error:'Group owner permission required'});}
   await db.query('COMMIT');return send(res,200,{status:'saved'});
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 if(path==='/api/messenger/status'&&req.method==='GET'){
  const statuses=await pool.query(`SELECT st.id,st.owner_id,u.display_name AS name,st.body,st.created_at,st.expires_at,a.id AS attachment_id,a.name AS attachment_name,a.mime AS attachment_mime FROM messenger_status st JOIN users u ON u.id=st.owner_id LEFT JOIN messenger_attachments a ON a.id=st.attachment_id WHERE st.tenant_id=$2 AND st.expires_at>UTC_TIMESTAMP(3) AND (st.owner_id=$1 OR (st.audience='contacts' AND EXISTS(SELECT 1 FROM contacts WHERE owner_id=$1 AND contact_id=st.owner_id) AND EXISTS(SELECT 1 FROM contacts WHERE owner_id=st.owner_id AND contact_id=$1))) ORDER BY st.created_at DESC LIMIT 200`,[user.id,user.tenant_id]);return send(res,200,{viewer:user.id,statuses:statuses.rows});
 }
 if(path==='/api/messenger/status'&&req.method==='POST'){
  const {body,attachmentId=null,audience='contacts'}=await readJson(req);if(typeof body!=='string'||!body.trim()||body.length>700||!['contacts','private'].includes(audience)||!await allowedAttachment(pool,user,attachmentId))return send(res,400,{error:'Status up to 700 characters, an owned attachment and valid audience required'});
  const id=randomUUID();await pool.query('INSERT INTO messenger_status(id,owner_id,tenant_id,body,attachment_id,audience,expires_at) VALUES($1,$2,$3,$4,$5,$6,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 24 HOUR))',[id,user.id,user.tenant_id,body.trim(),attachmentId,audience]);return send(res,201,{id});
 }
 const status=/^\/api\/messenger\/status\/([0-9a-f-]{36})$/.exec(path);
 if(status&&uuid.test(status[1])&&req.method==='DELETE'){await pool.query('DELETE FROM messenger_status WHERE id=$1 AND owner_id=$2 AND tenant_id=$3',[status[1],user.id,user.tenant_id]);return send(res,200,{status:'removed'});}
 return send(res,404,{error:'Messenger route unavailable'});
}
