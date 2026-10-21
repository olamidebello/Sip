import {createDatabase} from './db.js';
import {migrateVoicemail,provisionVoicemail} from './voicemail.js';
const db=createDatabase(process.env.MYSQL_URL);
try{
 if(process.argv.includes('--migrate'))await migrateVoicemail(db);
 else if(process.argv.includes('--ack')){
  let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>10000000)throw Error('Acknowledgement too large');}
  const entries=JSON.parse(text);if(!Array.isArray(entries)||entries.length>50000)throw Error('Invalid acknowledgement');
  for(const m of entries){if(!/^[a-f0-9-]{36}$/i.test(m.mailbox_id||'')||!Number.isSafeInteger(m.revision))throw Error('Invalid mailbox revision');await db.query('UPDATE voicemail_mailboxes SET applied_revision=$1 WHERE mailbox_id=$2 AND revision=$1',[m.revision,m.mailbox_id]);}
 }else{
  await provisionVoicemail(db);
  const rows=(await db.query(`SELECT m.mailbox_id,m.tenant_id,m.enabled,m.max_seconds,m.revision,m.applied_revision,u.display_name FROM voicemail_mailboxes m JOIN users u ON u.id=m.user_id AND u.tenant_id=m.tenant_id JOIN tenants t ON t.id=u.tenant_id WHERE u.status='active' AND t.status='active' ORDER BY m.tenant_id,m.mailbox_id LIMIT 50001`)).rows;
  if(rows.length>50000)throw Error('Mailbox capacity exceeded');process.stdout.write(JSON.stringify(rows));
 }
}finally{await db.end();}
