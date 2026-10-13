import {migrateSocialLinks,handleSocialLinks} from './socialLinks.js';
import {randomUUID} from 'node:crypto';
import {navigationFor} from './navigationPolicy.js';
export function validSocialBody(value){return typeof value==='string'&&value.trim().length>0&&Array.from(value.trim()).length<=280;}
export async function migrateSocial(pool){
 await migrateSocialLinks(pool);
 await pool.query(`CREATE TABLE IF NOT EXISTS social_posts(id CHAR(36) PRIMARY KEY,tenant_id CHAR(36) NOT NULL,user_id CHAR(36) NOT NULL,body VARCHAR(1120) NOT NULL,parent_id CHAR(36) NULL,created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(parent_id) REFERENCES social_posts(id),INDEX(tenant_id,created_at)) ENGINE=InnoDB`);
 const quote=await pool.query("SHOW COLUMNS FROM social_posts LIKE 'quote_id'");if(!quote.rowCount)await pool.query('ALTER TABLE social_posts ADD COLUMN quote_id CHAR(36) NULL');
 for(const kind of ['likes','reposts','bookmarks'])await pool.query(`CREATE TABLE IF NOT EXISTS social_${kind}(user_id CHAR(36) NOT NULL,post_id CHAR(36) NOT NULL,PRIMARY KEY(user_id,post_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(post_id) REFERENCES social_posts(id) ON DELETE CASCADE) ENGINE=InnoDB`);
 await pool.query(`CREATE TABLE IF NOT EXISTS social_follows(user_id CHAR(36) NOT NULL,target_id CHAR(36) NOT NULL,PRIMARY KEY(user_id,target_id),FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(target_id) REFERENCES users(id)) ENGINE=InnoDB`);
}
export async function handleSocial({req,res,path,user,pool,send,readJson}){
 if(!(await navigationFor(pool,user)).social)return send(res,403,{error:'Social unavailable'});
 if(path.startsWith('/api/social/links')||/^\/api\/social\/profiles\/[^/]+\/links$/.test(path))return handleSocialLinks({req,res,path,user,pool,send,readJson});
 const url=new URL(req.url,'http://localhost');
 if(path==='/api/social/profiles'&&req.method==='GET'){
 const q=(url.searchParams.get('q')||'').slice(0,80);
 return send(res,200,{profiles:(await pool.query(`SELECT u.id,u.display_name AS name,(SELECT COUNT(*) FROM social_follows WHERE target_id=u.id) followers,EXISTS(SELECT 1 FROM social_follows WHERE user_id=$1 AND target_id=u.id) following FROM users u WHERE u.tenant_id=$2 AND u.status='active' AND u.display_name LIKE $3 LIMIT 30`,[user.id,user.tenant_id,'%'+q+'%'])).rows});
 }
 if(path==='/api/social/posts'&&req.method==='GET'){
 const mode=url.searchParams.get('mode'),q=(url.searchParams.get('q')||'').slice(0,80),author=url.searchParams.get('author');
 const thread=url.searchParams.get('thread'),cursorId=url.searchParams.get('cursorId');
 const before=url.searchParams.get('before');if(before&&!Number.isFinite(Date.parse(before)))return send(res,400,{error:'Invalid cursor'});
 const clauses=["p.tenant_id=$2","u.status='active'","p.body LIKE $3"],args=[user.id,user.tenant_id,'%'+q+'%'];
 if(mode==='following')clauses.push('EXISTS(SELECT 1 FROM social_follows WHERE user_id=$1 AND target_id=p.user_id)');
 if(mode==='bookmarks')clauses.push('EXISTS(SELECT 1 FROM social_bookmarks WHERE user_id=$1 AND post_id=p.id)');
 if(author){args.push(author);clauses.push('p.user_id=$'+args.length);}
 if(thread){args.push(thread);clauses.push('(p.id=$'+args.length+' OR p.parent_id=$'+args.length+')');}
 if(before){args.push(new Date(before));const index=args.length;if(cursorId){args.push(cursorId);clauses.push('(p.created_at<$'+index+' OR (p.created_at=$'+index+' AND p.id<$'+args.length+'))');}else clauses.push('p.created_at<$'+index);}

 const posts=(await pool.query(`SELECT p.*,u.display_name AS name,CASE WHEN qu.id IS NOT NULL THEN qp.body ELSE NULL END AS quote_body,qu.display_name AS quote_name, (SELECT COUNT(*) FROM social_likes WHERE post_id=p.id) likes,(SELECT COUNT(*) FROM social_reposts WHERE post_id=p.id) reposts,(SELECT COUNT(*) FROM social_posts WHERE parent_id=p.id) replies,EXISTS(SELECT 1 FROM social_likes WHERE user_id=$1 AND post_id=p.id) liked,EXISTS(SELECT 1 FROM social_reposts WHERE user_id=$1 AND post_id=p.id) reposted,EXISTS(SELECT 1 FROM social_bookmarks WHERE user_id=$1 AND post_id=p.id) bookmarked FROM social_posts p JOIN users u ON u.id=p.user_id LEFT JOIN social_posts qp ON qp.id=p.quote_id AND qp.tenant_id=p.tenant_id LEFT JOIN users qu ON qu.id=qp.user_id AND qu.status='active' WHERE ${clauses.join(' AND ')} ORDER BY p.created_at DESC,p.id DESC LIMIT 50`,args)).rows;
 return send(res,200,{posts,userId:user.id,nextCursor:posts.length===50?{before:new Date(posts.at(-1).created_at).toISOString(),cursorId:posts.at(-1).id}:null});
 }
 if(path==='/api/social/posts'&&req.method==='POST'){
 const value=await readJson(req);if(!validSocialBody(value.body))return send(res,400,{error:'Write 1–280 characters'});
 if(value.parentId&&!(await pool.query('SELECT id FROM social_posts WHERE id=$1 AND tenant_id=$2',[value.parentId,user.tenant_id])).rowCount)return send(res,404,{error:'Reply target unavailable'});
 if(value.parentId&&value.quoteId)return send(res,400,{error:'A post may reply or quote, not both'});
 if(value.quoteId&&!(await pool.query('SELECT id FROM social_posts WHERE id=$1 AND tenant_id=$2',[value.quoteId,user.tenant_id])).rowCount)return send(res,404,{error:'Quoted post unavailable'});
 const id=randomUUID();await pool.query('INSERT INTO social_posts(id,tenant_id,user_id,body,parent_id,quote_id) VALUES($1,$2,$3,$4,$5,$6)',[id,user.tenant_id,user.id,value.body.trim(),value.parentId||null,value.quoteId||null]);return send(res,201,{id});
 }
 const follow=/^\/api\/social\/profiles\/([^/]+)\/follow$/.exec(path);
 if(follow&&['PUT','DELETE'].includes(req.method)){
 if(follow[1]===user.id)return send(res,400,{error:'Cannot follow yourself'});
 if(!(await pool.query("SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND status='active'",[follow[1],user.tenant_id])).rowCount)return send(res,404,{error:'Profile unavailable'});
 await pool.query(req.method==='PUT'?'INSERT IGNORE INTO social_follows(user_id,target_id) VALUES($1,$2)':'DELETE FROM social_follows WHERE user_id=$1 AND target_id=$2',[user.id,follow[1]]);return send(res,200,{ok:true});
 }
 const action=/^\/api\/social\/posts\/([^/]+)(?:\/(likes|reposts|bookmarks))?$/.exec(path);
 if(action){
 const post=(await pool.query('SELECT user_id FROM social_posts WHERE id=$1 AND tenant_id=$2',[action[1],user.tenant_id])).rows[0];if(!post)return send(res,404,{error:'Post unavailable'});
 if(!action[2]&&req.method==='DELETE'){
 if(post.user_id!==user.id&&!['admin','super_admin'].includes(user.role))return send(res,403,{error:'Only author or moderator may remove a post'});
 await pool.query("UPDATE social_posts SET body='[Post removed]' WHERE id=$1 AND tenant_id=$2",[action[1],user.tenant_id]);return send(res,200,{ok:true});
 }
 if(action[2]&&['PUT','DELETE'].includes(req.method)){
 await pool.query(req.method==='PUT'?`INSERT IGNORE INTO social_${action[2]}(user_id,post_id) VALUES($1,$2)`:`DELETE FROM social_${action[2]} WHERE user_id=$1 AND post_id=$2`,[user.id,action[1]]);return send(res,200,{ok:true});
 }
 }
 return send(res,404,{error:'Social route unavailable'});
}
