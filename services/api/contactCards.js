export async function migrateContactCards(pool){await pool.query(`CREATE TABLE IF NOT EXISTS contact_cards(owner_id CHAR(36) NOT NULL,contact_key VARCHAR(255) NOT NULL,card JSON NOT NULL,PRIMARY KEY(owner_id,contact_key),FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);}
export async function handleContactCards({req,res,user,pool,send,readJson}){
 const b=req.method==='GET'?Object.fromEntries(new URL(req.url,'http://localhost').searchParams):await readJson(req);if(typeof b.key!=='string'||!b.key||b.key.length>255)return send(res,400,{error:'Contact key required'});
 if(req.method==='GET'){const row=(await pool.query('SELECT card FROM contact_cards WHERE owner_id=$1 AND contact_key=$2',[user.id,b.key])).rows[0];return send(res,200,{card:row?(typeof row.card==='string'?JSON.parse(row.card):row.card):{name:'',about:'',labels:'',favorite:false}});}
 if(req.method==='PUT'){
 const c=b.card;if(!c||Object.keys(c).some(k=>!['name','about','labels','favorite'].includes(k))||['name','about','labels'].some(k=>typeof c[k]!=='string'||c[k].length>(k==='about'?500:160))||typeof c.favorite!=='boolean')return send(res,400,{error:'Valid contact name, notes, labels and favorite state required'});
 await pool.query('INSERT INTO contact_cards(owner_id,contact_key,card) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE card=VALUES(card)',[user.id,b.key,JSON.stringify(c)]);return send(res,200,{card:c});
 }
 return send(res,405,{error:'GET or PUT required'});
}
