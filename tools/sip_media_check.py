#!/usr/bin/env python3
import pathlib,re,socket,secrets,sys,json
config=pathlib.Path('/etc/kamailio/kamailio.cfg').read_text()
endpoints=re.findall(r'modparam\s*\(\s*"rtpengine"\s*,\s*"rtpengine_sock"\s*,\s*"udp:([0-9.]+):(\d+)"\s*\)',config)
if len(endpoints)!=1:
 print('RTPengine control: FAIL - expected one explicit UDP endpoint');sys.exit(1)
host,port=endpoints[0]
if host not in ('127.0.0.1',):
 print('RTPengine control: FAIL - explicit remote endpoint requires separate verification');sys.exit(1)
cookie=secrets.token_hex(8).encode();sock=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);sock.settimeout(3)
try:
 sock.sendto(cookie+b' d7:command4:pinge',(host,int(port)))
 data,peer=sock.recvfrom(4096)
 if not data.startswith(cookie+b' ') or b'4:pong' not in data:raise ValueError()
 print('RTPengine control ping: PASS')
except Exception:
 print('RTPengine control ping: FAIL');sys.exit(1)
finally:sock.close()
for phase in ('offer','answer'):
 print('Explicit RTPengine '+phase+' hook: '+('PRESENT' if re.search(r'\brtpengine_'+phase+r'\s*\(',config) else 'NOT FOUND (may use rtpengine_manage)'))
print('UDP media reachability and two-way audio: REQUIRES CLIENT TEST CALL')
