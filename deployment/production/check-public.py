#!/usr/bin/env python3
import argparse,json,socket,ssl,urllib.request,base64,os,hashlib
p=argparse.ArgumentParser();p.add_argument('--domain',required=True);p.add_argument('--sip',action='store_true');p.add_argument('--release');a=p.parse_args()
context=ssl.create_default_context()
for path in ['/api/health','/']:
 with urllib.request.urlopen('https://'+a.domain+path,timeout=10,context=context) as response:
  if response.status!=200:raise SystemExit('Public HTTPS readiness failed')
  content=response.read(1048576)
  if path=='/api/health':
   body=json.loads(content)
   if body.get('status')!='ok' or a.release and body.get('release')!=a.release:raise SystemExit('API release/readiness failed')
  if path=='/' and b'<html' not in content.lower():raise SystemExit('GUI readiness failed')
if a.sip:
 key=base64.b64encode(os.urandom(16)).decode()
 expected=base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
 with context.wrap_socket(socket.create_connection((a.domain,443),timeout=10),server_hostname=a.domain) as connection:
  connection.sendall(('GET /ws HTTP/1.1\r\nHost: '+a.domain+'\r\nOrigin: https://'+a.domain+'\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: '+key+'\r\nSec-WebSocket-Protocol: sip\r\n\r\n').encode())
  data=b''
  while b'\r\n\r\n' not in data and len(data)<16384:
   chunk=connection.recv(4096)
   if not chunk:break
   data+=chunk
  lines=data.decode('latin1').split('\r\n');headers={}
  for line in lines[1:]:
   if ':' in line:
    name,value=line.split(':',1);headers[name.lower()]=value.strip()
  if not lines[0].startswith('HTTP/1.1 101 ') or headers.get('sec-websocket-accept')!=expected or headers.get('sec-websocket-protocol')!='sip':raise SystemExit('SIP transport not available through public WSS')
print('Verified public HTTPS, GUI'+(', and SIP WebSocket transport' if a.sip else '')+'. Real media acceptance is separate.')
