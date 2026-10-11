export const defaultHelpPreferences={showHints:true,showGuides:true,showFieldHints:true,
  detail:'standard',overrides:{}};
const target=/^[a-z][a-z0-9-]{0,79}$/;
const guides=new Set(['help-user','help-admin','help-technical']);
export function validateHelpPreferences(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||
    typeof value.showHints!=='boolean'||typeof value.showGuides!=='boolean'||
    typeof value.showFieldHints!=='boolean'||!['brief','standard'].includes(value.detail)||
    !value.overrides||typeof value.overrides!=='object'||Array.isArray(value.overrides))return false;
  const entries=Object.entries(value.overrides);
  return entries.length<=30&&entries.every(([id,item])=>target.test(id)&&item&&typeof item==='object'&&
    !Array.isArray(item)&&typeof item.hint==='string'&&item.hint.length<=240&&
    (item.guide===undefined||guides.has(item.guide)));
}
export async function migrateHelpPreferences(pool){
  await pool.query(`CREATE TABLE IF NOT EXISTS user_help_preferences (
    user_id CHAR(36) PRIMARY KEY,settings JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}
export async function handleHelpPreferences({req,res,user,pool,send,readJson}){
  if(req.method==='GET'){
    const result=await pool.query('SELECT settings FROM user_help_preferences WHERE user_id=$1',[user.id]);
    const raw=result.rows[0]?.settings;
    const settings=typeof raw==='string'?JSON.parse(raw):raw;
    return send(res,200,validateHelpPreferences(settings)?settings:defaultHelpPreferences);
  }
  if(req.method==='PUT'){
    const settings=await readJson(req);
    if(!validateHelpPreferences(settings))return send(res,400,{error:'Invalid hint and guide preferences'});
    await pool.query(`INSERT INTO user_help_preferences(user_id,settings) VALUES($1,$2)
      ON DUPLICATE KEY UPDATE settings=VALUES(settings)`,[user.id,JSON.stringify(settings)]);
    return send(res,200,settings);
  }
  if(req.method==='DELETE'){
    await pool.query('DELETE FROM user_help_preferences WHERE user_id=$1',[user.id]);
    return send(res,200,defaultHelpPreferences);
  }
  return send(res,405,{error:'GET, PUT or DELETE required'});
}
