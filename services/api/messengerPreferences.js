export function validateMessengerPreferences(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['highContrast','reduceMotion'].includes(key))||typeof value.highContrast!=='boolean'||typeof value.reduceMotion!=='boolean')throw new Error('Boolean contrast and animation preferences required');return {highContrast:value.highContrast,reduceMotion:value.reduceMotion};
}
export async function migrateMessengerPreferences(pool){await pool.query(`CREATE TABLE IF NOT EXISTS messenger_preferences(user_id CHAR(36) PRIMARY KEY, high_contrast BOOLEAN NOT NULL DEFAULT FALSE,reduce_motion BOOLEAN NOT NULL DEFAULT FALSE,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);}
export async function handleMessengerPreferences({req,res,user,pool,send,readJson}){
 if(req.method==='GET'){const result=await pool.query('SELECT high_contrast,reduce_motion FROM messenger_preferences WHERE user_id=$1',[user.id]);return send(res,200,{highContrast:!!result.rows[0]?.high_contrast,reduceMotion:!!result.rows[0]?.reduce_motion});}
 if(req.method==='PUT'){let value;try{value=validateMessengerPreferences(await readJson(req));}catch(error){return send(res,400,{error:error.message});}await pool.query('INSERT INTO messenger_preferences(user_id,high_contrast,reduce_motion) VALUES($1,$2,$3) ON DUPLICATE KEY UPDATE high_contrast=VALUES(high_contrast),reduce_motion=VALUES(reduce_motion)',[user.id,value.highContrast,value.reduceMotion]);return send(res,200,value);}
 return send(res,405,{error:'GET or PUT required'});
}
