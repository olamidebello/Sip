import {defaultPresence,ensureDefaultPresence} from './defaultPresence.js';
import {googleContactsConfig} from './googleContactsConfig.js';
import {randomUUID} from 'node:crypto';
const states=['available','away','busy','invisible','dnd'];
export async function handleContactSettings({req,res,path,user,pool,send,readJson,url}) {
  if(path==='/api/contacts/google/config'&&req.method==='GET'){const setting=await googleContactsConfig(pool,user.tenant_id);return send(res,200,{configured:setting.configured,clientId:setting.configured?setting.clientId:null});}
  if(path==='/api/contacts/address-book'&&req.method==='GET')return send(res,200,{contacts:(await pool.query('SELECT id,name,email,phone FROM personal_address_book WHERE owner_id=$1 ORDER BY name LIMIT 2000',[user.id])).rows});
  if(path==='/api/contacts/address-book'&&req.method==='POST') {
    const {contacts}=await readJson(req,256000);
    if(!Array.isArray(contacts)||!contacts.length||contacts.length>500||contacts.some(c=>!c||typeof c.name!=='string'||c.name.length>160||typeof c.email!=='string'||c.email.length>254||typeof c.phone!=='string'||c.phone.length>64||(!c.email&&!c.phone)||(c.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email))))return send(res,400,{error:'Import up to 500 contacts with a valid email or phone'});
    const db=await pool.connect();try{await db.query('BEGIN');
      for(const c of contacts)await db.query(`INSERT INTO personal_address_book(id,owner_id,name,email,phone) VALUES($1,$2,$3,$4,$5)
        ON DUPLICATE KEY UPDATE name=VALUES(name)`,[randomUUID(),user.id,c.name.trim(),c.email.trim().toLowerCase(),c.phone.trim()]);
      await db.query('COMMIT');return send(res,200,{processed:contacts.length});
    }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }
  if(path==='/api/contacts/search' &&req.method==='GET') {
    const q=(url.searchParams.get('q')||'').trim();
    if(q.length<2||q.length>100)return send(res,400,{error:'Enter 2–100 characters'});
    const rows=await pool.query(`SELECT u.id,u.display_name AS name,u.email,
      CASE WHEN p.share_presence=true AND p.presence<>'invisible' THEN p.presence ELSE 'hidden' END AS presence,
      CASE WHEN p.share_presence=true AND p.presence<>'invisible' THEN p.status_text ELSE '' END AS status_text
      FROM users u JOIN user_presence p ON p.user_id=u.id LEFT JOIN user_profiles profile ON profile.user_id=u.id
      WHERE u.tenant_id=$1 AND u.id<>$2 AND u.status='active' AND p.searchable=true
      AND (LOCATE($3,LOWER(u.display_name))>0 OR LOCATE($3,LOWER(u.email))>0 OR ($4<>'' AND profile.phone_e164=$4))
      ORDER BY u.display_name,u.id LIMIT 50`,[user.tenant_id,user.id,q.toLowerCase(),/^\+[1-9][0-9]{7,14}$/.test(q.replace(/[ ()-]/g,''))?q.replace(/[ ()-]/g,''):'']);
    return send(res,200,{users:rows.rows});
  }
  if(path!=='/api/account/contact-settings')return send(res,404,{error:'Route unavailable'});
  if(req.method==='GET') {
    await ensureDefaultPresence(pool,user.id);
    const row=(await pool.query('SELECT * FROM user_presence WHERE user_id=$1',[user.id])).rows[0];
    return send(res,200,row||defaultPresence);
  }
  if(req.method==='PUT') {
    const i=await readJson(req);
    if(['searchable','share_presence','accept_forwarded'].some(k=>typeof i[k]!=='boolean')||!states.includes(i.presence)||typeof i.status_text!=='string'||i.status_text.length>160)
      return send(res,400,{error:'Valid visibility, presence and status settings required'});
    for(const key of ['call_forward','message_forward']) {
      if(i[key]!==null) {
        if(typeof i[key]!=='string'||i[key]===user.id)return send(res,400,{error:'Choose a different active contact'});
        const found=await pool.query(`SELECT 1 FROM contacts c JOIN users u ON u.id=c.contact_id JOIN user_presence p ON p.user_id=u.id
          WHERE c.owner_id=$1 AND c.contact_id=$2 AND u.tenant_id=$3 AND u.status='active' AND p.accept_forwarded=true`,[user.id,i[key],user.tenant_id]);
        if(!found.rowCount)return send(res,400,{error:'Forwarding destination must be an active contact who accepts forwarding'});
      }
    }
    await pool.query(`INSERT INTO user_presence(user_id,searchable,presence,status_text,share_presence,accept_forwarded,call_forward,message_forward)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON DUPLICATE KEY UPDATE searchable=VALUES(searchable),presence=VALUES(presence),
      status_text=VALUES(status_text),share_presence=VALUES(share_presence),accept_forwarded=VALUES(accept_forwarded),call_forward=VALUES(call_forward),message_forward=VALUES(message_forward)`,
      [user.id,i.searchable,i.presence,i.status_text.trim(),i.share_presence,i.accept_forwarded,i.call_forward,i.message_forward]);
    return send(res,200,{status:'saved'});
  }
  return send(res,405,{error:'Method unavailable'});
}
