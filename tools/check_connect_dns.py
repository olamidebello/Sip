#!/usr/bin/env python3
"""Require matching public DNS answers without changing the host resolver."""
import concurrent.futures,ipaddress,json,socket,urllib.request
NAMES=('olamideconnect.com','www.olamideconnect.com')
RESOLVERS=('https://dns.google/resolve','https://cloudflare-dns.com/dns-query')
EXPECTED={'154.29.77.102'}
def fetch_dns(resolver,name,kind):
 request=urllib.request.Request(resolver+'?name='+name+'&type='+kind,headers={'Accept':'application/dns-json','User-Agent':'OlamideConnect-Domain-Check'})
 with urllib.request.urlopen(request,timeout=12) as response:
  raw=response.read(65537)
 if len(raw)>65536:raise ValueError('DNS response too large')
 return json.loads(raw)
def records(reply,kind):
 if not isinstance(reply,dict) or reply.get('Status')!=0:raise ValueError('DNS lookup did not succeed')
 result=set()
 for row in reply.get('Answer',[]):
  if row.get('type')==kind:
   value=str(ipaddress.ip_address(row['data']))
   if ipaddress.ip_address(value).version!=(4 if kind==1 else 6):raise ValueError('Unexpected DNS address family')
   result.add(value)
 return result
def verify(fetch=fetch_dns,local=None):
 queries=[(resolver,name,kind) for resolver in RESOLVERS for name in NAMES for kind in ('A','AAAA')]
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
  replies=list(executor.map(lambda q:fetch(*q),queries))
 for (resolver,name,kind),reply in zip(queries,replies):
  values=records(reply,1 if kind=='A' else 28)
  if (kind=='A' and values!=EXPECTED) or (kind=='AAAA' and values):
   raise ValueError('Public DNS must point exclusively to 154.29.77.102 with no AAAA records: '+name)
 if local is None:
  def local(name):
   try:return {row[4][0] for row in socket.getaddrinfo(name,None,socket.AF_INET)}
   except socket.gaierror:return set()
 result=[]
 for name in NAMES:
  addresses=set(local(name));result.append({'name':name,'public':'154.29.77.102','local':sorted(addresses),'local_cache_stale':addresses!=EXPECTED})
 return result
if __name__=='__main__':
 try:
  for row in verify():print('CONNECT_DOMAIN_DNS '+json.dumps(row,sort_keys=True))
 except Exception as error:
  # Fixed destination names only; never expose transport headers or credentials.
  raise SystemExit('Public DNS verification failed ('+type(error).__name__+'). Both public resolvers must agree before deployment. No server changes made.')
