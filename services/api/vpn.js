import net from 'node:net';
export function vpnRequest(data){return new Promise((resolve,reject)=>{
 const socket=net.createConnection('/run/olamide-vpn/control.sock');let body='';
 socket.setTimeout(10000,()=>socket.destroy(Error('VPN control timed out')));
 socket.on('connect',()=>socket.write(JSON.stringify(data)+'\n'));
 socket.on('data',chunk=>{body+=chunk;if(Buffer.byteLength(body)>1024*1024)return socket.destroy(Error('VPN response too large'));if(!body.includes('\n'))return;socket.end();try{const r=JSON.parse(body);if(!r.ok)reject(Error(r.error||'VPN unavailable'));else resolve(r.data);}catch{reject(Error('Invalid VPN response'));}});
 socket.on('error',()=>reject(Error('VPN service unavailable; contact administrator')));
 socket.on('end',()=>{if(!body.includes('\n'))reject(Error('VPN response incomplete'));});
 });}
export async function handleVpn({req,res,path,user,pool,send,readJson,request=vpnRequest}){
 res.setHeader('Cache-Control','no-store');
 const admin=path.startsWith('/api/admin/vpn');
 if(admin&&user.role!=='super_admin')return send(res,403,{error:'Super administrator required'});
 const base={tenant:user.tenant_id,user:user.id};
 try{
  if(path==='/api/vpn'&&req.method==='GET')return send(res,200,await request({...base,op:'provision'}));
  if(path==='/api/vpn/config'&&req.method==='POST')return send(res,200,await request({...base,op:'config'}));
  if(path==='/api/admin/vpn'&&req.method==='GET'){
   const state=await request({...base,op:'list'});
   const users=(await pool.query("SELECT id,display_name,email,status FROM users WHERE tenant_id=$1 ORDER BY display_name,id LIMIT 1000",[user.tenant_id])).rows;
   return send(res,200,{...state,users});
  }
  if(path==='/api/admin/vpn/settings'&&req.method==='PUT'){
   const b=await readJson(req);if(typeof b.enabled!=='boolean'||typeof b.automatic!=='boolean')return send(res,400,{error:'Enabled and automatic must be booleans'});
   return send(res,200,await request({...base,op:'settings',enabled:b.enabled,automatic:b.automatic}));
  }
  const match=/^\/api\/admin\/vpn\/users\/([a-f0-9-]{36})(?:\/(rotate))?$/i.exec(path);
  if(match&&req.method==='PUT'){
   const target=(await pool.query('SELECT id,status FROM users WHERE id=$1 AND tenant_id=$2',[match[1],user.tenant_id])).rows[0];
   if(!target)return send(res,404,{error:'User unavailable'});
   const b=await readJson(req);
   if(!match[2]&&typeof b.enabled!=='boolean')return send(res,400,{error:'Enabled must be boolean'});
   if(target.status!=='active'&&(b.enabled||match[2]))return send(res,409,{error:'Activate user before enabling VPN'});
   const result=await request({...base,user:target.id,op:match[2]?'rotate':'update',enabled:b.enabled});
   return send(res,200,result);
  }
  return send(res,405,{error:'Unsupported VPN action'});
 }catch(e){return send(res,503,{error:e.message});}
}
