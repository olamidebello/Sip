#!/usr/bin/env python3
"""Renew a Flowroute SIP registration; no credentials or SIP packets are logged."""
import hashlib,json,pathlib,re,secrets,socket,sys
HOSTS={'us-east-va.sip.flowroute.com','us-west-or.sip.flowroute.com'}
def authorization(challenge,username,password,uri,cnonce):
 fields={}
 for match in re.finditer(r'(\w+)\s*=\s*(?:"([^"]*)"|([^,\s]+))',challenge):fields[match[1].lower()]=match[2] if match[2] is not None else match[3]
 if fields.get('algorithm','MD5').upper()!='MD5':raise ValueError('Unsupported digest algorithm')
 realm,nonce=fields['realm'],fields['nonce']
 if any('"' in v or '\r' in v or '\n' in v for v in [realm,nonce,username]):raise ValueError('Invalid digest')
 h=lambda s:hashlib.md5(s.encode()).hexdigest()
 ha1=h(username+':'+realm+':'+password);ha2=h('REGISTER:'+uri)
 qop=fields.get('qop');extra=''
 if qop:
  if 'auth' not in [q.strip() for q in qop.split(',')]:raise ValueError('Unsupported digest qop')
  response=h(ha1+':'+nonce+':00000001:'+cnonce+':auth:'+ha2);extra=', qop=auth, nc=00000001, cnonce="'+cnonce+'"'
 else:response=h(ha1+':'+nonce+':'+ha2)
 if 'opaque' in fields:
  if any(x in fields['opaque'] for x in ['\"','\r','\n']):raise ValueError('Invalid opaque')
  extra+=', opaque=\"'+fields['opaque']+'\"'
 return f'Digest username="{username}", realm="{realm}", nonce="{nonce}", uri="{uri}", response="{response}", algorithm=MD5'+extra

def register(c):
 import ipaddress
 host=c['host'];user=c['username'];password=c['password'];public=str(ipaddress.IPv4Address(c['publicIp']))
 if host not in HOSTS or not re.fullmatch(r'\d{8}',user) or not isinstance(password,str) or not password:raise ValueError('Invalid configuration')
 uri='sip:'+host;callid=secrets.token_hex(16)+'@'+public;tag=secrets.token_hex(8)
 with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as sock:
  sock.settimeout(3);sock.connect((host,5060));localport=sock.getsockname()[1]
  def exchange(seq,auth=None,proxy=False):
   branch='z9hG4bK'+secrets.token_hex(10)
   lines=[f'REGISTER {uri} SIP/2.0',f'Via: SIP/2.0/UDP {public}:{localport};branch={branch};rport','Max-Forwards: 70',f'From: <sip:{user}@{host}>;tag={tag}',f'To: <sip:{user}@{host}>',f'Call-ID: {callid}',f'CSeq: {seq} REGISTER',f'Contact: <sip:{user}@{public}:5060;transport=udp>','Expires: 600','User-Agent: Olamide-Flowroute-Registration','Content-Length: 0']
   if auth:lines.insert(-1,('Proxy-Authorization: ' if proxy else 'Authorization: ')+auth)
   packet=('\r\n'.join(lines)+'\r\n\r\n').encode()
   for _ in range(3):
    sock.send(packet)
    try:
     for _ in range(5):
      reply=sock.recv(65535).decode(errors='replace')
      if f'Call-ID: {callid}'.lower() not in reply.lower() or f'CSeq: {seq} REGISTER'.lower() not in reply.lower():continue
      code=int(reply.split(' ',2)[1]);headers={}
      for line in reply.split('\r\n')[1:]:
       if ':' in line:k,v=line.split(':',1);headers[k.lower()]=v.strip()
      if code>=200:return code,headers
    except socket.timeout:continue
   raise TimeoutError('No registration response')
  code,headers=exchange(1)
  if code in (401,407):
   challenge=headers.get('www-authenticate' if code==401 else 'proxy-authenticate','')
   code,headers=exchange(2,authorization(challenge,user,password,uri,secrets.token_hex(12)),code==407)
  if code!=200:raise ValueError('Registration rejected')
  if headers.get('expires')=='0':raise ValueError('Registration not retained')
 return {'state':'registered','expiresSeconds':600}
if __name__=='__main__':
 try:
  c=json.loads(pathlib.Path(sys.argv[1]).read_text());register(c);print('FLOWROUTE_REGISTRATION registered')
 except Exception:print('FLOWROUTE_REGISTRATION failed');sys.exit(1)
