export const socialPlatforms={x:['x.com','twitter.com'],instagram:['instagram.com'],facebook:['facebook.com'],linkedin:['linkedin.com'],tiktok:['tiktok.com'],youtube:['youtube.com','youtu.be'],threads:['threads.net','threads.com'],bluesky:['bsky.app']};
export function validateSocialLink(platform,value){
 if(!Object.hasOwn(socialPlatforms,platform)||typeof value!=='string'||value.length>500)throw Error('Supported platform and profile URL required');
 const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||!socialPlatforms[platform].some(host=>url.hostname===host||url.hostname==='www.'+host)||url.pathname==='/')throw Error('Enter a full HTTPS profile URL on the selected platform');
 url.hash='';url.search='';return url.href;
}
export async function migrateSocialLinks(pool){await pool.query(`CREATE TABLE IF NOT EXISTS social_profile_links(user_id CHAR(36) NOT NULL,platform VARCHAR(20) NOT NULL,url VARCHAR(500) NOT NULL,visible BOOLEAN NOT NULL DEFAULT TRUE,PRIMARY KEY(user_id,platform),FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB`);}
export async function handleSocialLinks({req,res,path,user,pool,send,readJson}){
 if(path==='/api/social/links'&&req.method==='GET')return send(res,200,{platforms:Object.keys(socialPlatforms),links:(await pool.query('SELECT platform,url,visible FROM social_profile_links WHERE user_id=$1',[user.id])).rows});
 const publicProfile=/^\/api\/social\/profiles\/([^/]+)\/links$/.exec(path);
 if(publicProfile&&req.method==='GET')return send(res,200,{links:(await pool.query("SELECT l.platform,l.url FROM social_profile_links l JOIN users u ON u.id=l.user_id WHERE u.id=$1 AND u.tenant_id=$2 AND u.status='active' AND l.visible=TRUE",[publicProfile[1],user.tenant_id])).rows});
 const match=/^\/api\/social\/links\/([a-z]+)$/.exec(path);
 if(!match||!Object.hasOwn(socialPlatforms,match[1]))return send(res,404,{error:'Social link unavailable'});
 if(req.method==='DELETE'){await pool.query('DELETE FROM social_profile_links WHERE user_id=$1 AND platform=$2',[user.id,match[1]]);return send(res,200,{removed:true});}
 if(req.method==='PUT'){
 const b=await readJson(req);let url;try{url=validateSocialLink(match[1],b.url);if(typeof b.visible!=='boolean')throw Error('Visibility required');}catch{return send(res,400,{error:'Supported HTTPS profile URL and visibility required'});}
 await pool.query('INSERT INTO social_profile_links(user_id,platform,url,visible) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE url=VALUES(url),visible=VALUES(visible)',[user.id,match[1],url,b.visible]);return send(res,200,{platform:match[1],url,visible:b.visible});
 }
 return send(res,405,{error:'Method unavailable'});
}
