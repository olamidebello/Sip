#!/usr/bin/env python3
"""Private local WireGuard account broker. No network listener or shell execution."""
import base64,ipaddress,json,os,re,socket,socketserver,sqlite3,struct,subprocess,time,urllib.request
from pathlib import Path
CFG=Path('/etc/olamide/vpn/server.json')
STATE=Path('/var/lib/olamide/vpn')
SOCKET=Path('/run/olamide-vpn/control.sock')
UUID=re.compile(r'^[a-f0-9-]{36}$',re.I)

def run(args,data=None):
 p=subprocess.run(args,input=data,text=True,capture_output=True,timeout=8)
 if p.returncode:raise ValueError('WireGuard operation failed')
 return p.stdout.strip()

def public_peer(row,stats):
 h,rx,tx=stats.get(row['public_key'],(0,0,0))
 return {k:row[k] for k in ('tenant','user','address','enabled')}|{'lastHandshake':h,'receivedBytes':rx,'sentBytes':tx,'recentHandshake':bool(h and time.time()-h<180)}

class Agent:
 def __init__(self,config=None,path=None,runner=run):
  self.config=config or json.loads(CFG.read_text());self.run=runner
  self.db=sqlite3.connect(str(path or STATE/'accounts.sqlite3'));self.db.row_factory=sqlite3.Row
  self.db.executescript('CREATE TABLE IF NOT EXISTS peers(tenant TEXT NOT NULL,user TEXT NOT NULL,address TEXT UNIQUE NOT NULL,private_key TEXT NOT NULL,public_key TEXT UNIQUE NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(tenant,user)); CREATE TABLE IF NOT EXISTS settings(tenant TEXT PRIMARY KEY,enabled INTEGER NOT NULL,automatic INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS audit(tenant TEXT,user TEXT,action TEXT,created_at INTEGER);')
  self.db.commit()
 def stats(self):
  rows=self.run(['wg','show','wg-olamide','dump']).splitlines()[1:];result={}
  for line in rows:
   r=line.split('\t')
   if len(r)>=8:result[r[0]]=(int(r[4]),int(r[5]),int(r[6]))
  return result
 def sync(self):
  try:
   req=urllib.request.Request('http://127.0.0.1:18080/api/switch/kamailio/vpn-accounts',data=b'{}',headers={'Authorization':'Bearer '+self.config['bridgeToken'],'Content-Type':'application/json'})
   with urllib.request.urlopen(req,timeout=4) as response:active={(r['tenant_id'],r['id']) for r in json.load(response)['users']}
  except Exception:active=set()
  text='[Interface]\nPrivateKey = '+self.config['privateKey']+'\nListenPort = 51820\n'
  for p in self.db.execute('SELECT p.* FROM peers p JOIN settings s ON s.tenant=p.tenant WHERE p.enabled=1 AND s.enabled=1'):
   if (p['tenant'],p['user']) not in active:continue
   text+='\n[Peer]\nPublicKey = '+p['public_key']+'\nAllowedIPs = '+p['address']+'/32\n'
  # /dev/stdin avoids writing a second server private-key file.
  self.run(['wg','syncconf','wg-olamide','/dev/stdin'],text)
 def allocate(self,tenant,user):
  used={r[0] for r in self.db.execute('SELECT address FROM peers')}
  address=next((f'10.77.0.{n}' for n in range(2,255) if f'10.77.0.{n}' not in used),None)
  if not address:raise ValueError('VPN capacity reached (253 accounts)')
  private=self.run(['wg','genkey']);public=self.run(['wg','pubkey'],private+'\n')
  if any(len(base64.b64decode(k,validate=True))!=32 for k in [private,public]):raise ValueError('Invalid key generation')
  self.db.execute('INSERT INTO peers VALUES(?,?,?,?,?,1)',(tenant,user,address,private,public))
 def handle(self,r):
  op=r.get('op');tenant=r.get('tenant');user=r.get('user')
  if not isinstance(tenant,str) or not UUID.fullmatch(tenant):raise ValueError('Tenant required')
  if op not in ('list','settings') and (not isinstance(user,str) or not UUID.fullmatch(user)):raise ValueError('User required')
  self.db.execute('INSERT OR IGNORE INTO settings VALUES(?,1,1)',(tenant,));self.db.commit()
  settings=dict(self.db.execute('SELECT enabled,automatic FROM settings WHERE tenant=?',(tenant,)).fetchone())
  if op in ('settings','update','rotate'):
   self.db.execute('INSERT INTO audit VALUES(?,?,?,?)',(tenant,user or '',op,int(time.time())));self.db.commit()
  if op=='settings':
   if type(r.get('enabled')) is not bool or type(r.get('automatic')) is not bool:raise ValueError('Boolean settings required')
   self.db.execute('UPDATE settings SET enabled=?,automatic=? WHERE tenant=?',(r['enabled'],r['automatic'],tenant));self.db.commit();self.sync();return {'saved':True}
  if op=='list':
   stats=self.stats();return {'settings':settings,'peers':[public_peer(p,stats) for p in self.db.execute('SELECT * FROM peers WHERE tenant=?',(tenant,))]}
  p=self.db.execute('SELECT * FROM peers WHERE tenant=? AND user=?',(tenant,user)).fetchone()
  if op=='provision' and not p:
   if not settings['automatic'] or not settings['enabled']:return {'provisioned':False,'enabled':False}
   self.allocate(tenant,user);self.db.commit();self.sync()
  elif op=='update':
   if type(r.get('enabled')) is not bool:raise ValueError('Enabled required')
   if not p:self.allocate(tenant,user)
   self.db.execute('UPDATE peers SET enabled=? WHERE tenant=? AND user=?',(r['enabled'],tenant,user));self.db.commit();self.sync()
  elif op=='rotate':
   if not p:raise ValueError('Provision VPN first')
   private=self.run(['wg','genkey']);public=self.run(['wg','pubkey'],private+'\n')
   self.db.execute('UPDATE peers SET private_key=?,public_key=? WHERE tenant=? AND user=?',(private,public,tenant,user));self.db.commit();self.sync()
  elif op not in ('provision','config'):raise ValueError('Unknown VPN operation')
  p=self.db.execute('SELECT * FROM peers WHERE tenant=? AND user=?',(tenant,user)).fetchone()
  if not p:return {'provisioned':False,'enabled':False}
  result=public_peer(p,self.stats())|{'provisioned':True,'serverEnabled':bool(settings['enabled']),'automatic':bool(settings['automatic'])}
  if op=='config':
   if not settings['enabled'] or not p['enabled']:raise ValueError('VPN disabled by administrator')
   result['config']='[Interface]\nPrivateKey = '+p['private_key']+'\nAddress = '+p['address']+'/32\nDNS = 1.1.1.1\nMTU = 1280\n\n[Peer]\nPublicKey = '+self.config['publicKey']+'\nEndpoint = '+self.config['endpoint']+':51820\nAllowedIPs = 0.0.0.0/0, ::/0\nPersistentKeepalive = 25\n'
  return result

if __name__=='__main__':
 os.umask(0o077);STATE.mkdir(parents=True,exist_ok=True)
 agent=Agent();agent.sync();SOCKET.parent.mkdir(parents=True,exist_ok=True)
 if SOCKET.exists():SOCKET.unlink()
 class Handler(socketserver.StreamRequestHandler):
  def handle(self):
   self.connection.settimeout(5)
   _,uid,_=struct.unpack('3i',self.request.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
   if uid not in (0,1000):return
   try:
    raw=self.rfile.readline(4097)
    if len(raw)>4096:raise ValueError('Request too large')
    result={'ok':True,'data':agent.handle(json.loads(raw))}
   except Exception as e:
    agent.db.rollback();result={'ok':False,'error':str(e) if isinstance(e,ValueError) else 'VPN control unavailable'}
   self.wfile.write((json.dumps(result)+'\n').encode())
 with socketserver.UnixStreamServer(str(SOCKET),Handler) as server:
  os.chown(SOCKET,0,20001);os.chmod(SOCKET,0o660);os.chmod(SOCKET.parent,0o755)
  server.timeout=15
  while True:
   server.handle_request()
   try:agent.sync()
   except Exception:print('VPN peer synchronization unavailable',flush=True)
