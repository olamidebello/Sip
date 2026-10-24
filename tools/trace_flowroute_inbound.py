#!/usr/bin/env python3
"""Bounded SIP metadata observation. No packet data, identities or credentials saved."""
import collections,hashlib,ipaddress,re,socket,struct,time
NETWORKS=[ipaddress.ip_network('34.226.36.32/28'),ipaddress.ip_network('34.210.91.112/28')]
def decode(packet):
 if len(packet)<42 or packet[12:14]!=b'\x08\x00':return None
 ip=packet[14:];ihl=(ip[0]&15)*4
 if ip[0]>>4!=4 or ip[9]!=17 or len(ip)<ihl+8:return None
 if struct.unpack('!H',ip[6:8])[0]&0x3fff:return None
 src,dst=socket.inet_ntoa(ip[12:16]),socket.inet_ntoa(ip[16:20]);udp=ip[ihl:]
 sport,dport,length=struct.unpack('!HHH',udp[:6])
 if 5060 not in (sport,dport) or length<8:return None
 data=udp[8:length].decode('utf-8',errors='replace');line=data.split('\r\n',1)[0]
 call=re.search(r'(?im)^(?:Call-ID|i):\s*([^\r\n]+)',data)
 if not call:return None
 key=hashlib.sha256(call[1].strip().encode()).digest()
 if dport==5060 and line.startswith('INVITE '):
  return ('invite',key,any(ipaddress.ip_address(src) in n for n in NETWORKS))
 if sport==5060 and re.match(r'^SIP/2\.0 [1-6][0-9]{2}\b',line):return ('reply',key,int(line.split()[1]))
 return None

def main(seconds=45):
 invites,answers={},collections.defaultdict(set)
 with socket.socket(socket.AF_PACKET,socket.SOCK_RAW,socket.htons(0x0800)) as sock:
  sock.settimeout(1);deadline=time.monotonic()+seconds
  print('SIP_INBOUND_TRACE capture=started',flush=True)
  while time.monotonic()<deadline:
   try:event=decode(sock.recv(65535))
   except socket.timeout:continue
   if not event:continue
   kind,key,value=event
   if kind=='invite':invites[key]=invites.get(key,False) or value
   else:answers[key].add(value)
 print('SIP_INBOUND_TRACE invite_transactions='+str(len(invites)))
 print('SIP_INBOUND_TRACE documented_flowroute_sources='+str(sum(invites.values())))
 codes=collections.Counter(code for key in invites for code in answers[key])
 for code,count in sorted(codes.items()):print('SIP_INBOUND_TRACE response_'+str(code)+'='+str(count))
 if not invites:print('SIP_INBOUND_TRACE result=no_udp_invite_observed')
 elif not codes:print('SIP_INBOUND_TRACE result=no_response_observed')
 else:print('SIP_INBOUND_TRACE result=responses_observed')
if __name__=='__main__':
 try:main()
 except Exception:raise SystemExit('SIP_INBOUND_TRACE capture=failed')
