#!/usr/bin/env python3
import importlib.util,ipaddress,json,os,subprocess,sys
from pathlib import Path
import yaml
ROOT=Path('/opt/olamide/repo');ETC=Path('/etc/olamide/vpn');ETC.mkdir(parents=True,exist_ok=True);ETC.chmod(0o700)
def run(args):return subprocess.check_output(args,text=True).strip()
source=Path(sys.argv[1])/'olamide-firewall.py'
spec=importlib.util.spec_from_file_location('edge',source);edge=importlib.util.module_from_spec(spec);spec.loader.exec_module(edge)
media=[]
for proc,args in edge.processes('rtpengine'):
 media+=edge.rtp_ranges(args,edge.process_config(proc,args,'config-file','/etc/rtpengine/rtpengine.conf'))
if not media:raise SystemExit('RTPengine must be running to preserve media ports')
tcp,udp=edge.sip_ports(Path('/etc/kamailio/kamailio.cfg').read_text())
ports=set([str(p) for p in udp]+[str(a) if a==b else f'{a}-{b}' for a,b in media]+['3478','49160-49260'])
# rtp_ranges returns strings such as 30000-40000.
api_id=run(['docker','compose','ps','-q','api'])
if not api_id:raise SystemExit('API must be running')
container=json.loads(run(['docker','inspect',api_id]))[0]
env=dict(item.split('=',1) for item in container['Config']['Env'] if '=' in item)
token=env.get('KAMAILIO_HTTP_BRIDGE_TOKEN','')
if len(token)!=64 or any(c not in '0123456789abcdef' for c in token):raise SystemExit('Private switch bridge must be configured first')
configpath=ETC/'server.json'
if configpath.exists():config=json.loads(configpath.read_text())
else:
 for route in json.loads(run(['ip','-j','route','show','table','all'])):
  dst=route.get('dst','')
  if dst in ('default','broadcast','local',''):continue
  try:net=ipaddress.ip_network(dst,strict=False)
  except ValueError:continue
  if net.version==4 and net.overlaps(ipaddress.ip_network('10.77.0.0/24')):raise SystemExit('VPN subnet overlaps an existing route; review subnet first')
 private=run(['wg','genkey']);public=subprocess.check_output(['wg','pubkey'],input=private+'\n',text=True).strip()
 config={'privateKey':private,'publicKey':public,'endpoint':'154.29.77.102'}
config.update(bridgeToken=token,mediaPorts=sorted(ports));configpath.write_text(json.dumps(config));configpath.chmod(0o600)
wireguard=Path('/etc/wireguard');wireguard.mkdir(exist_ok=True);wireguard.chmod(0o700)
p=wireguard/'wg-olamide.conf';p.write_text('[Interface]\nAddress = 10.77.0.1/24\nListenPort = 51820\nPrivateKey = '+config['privateKey']+'\nMTU = 1280\n');p.chmod(0o600)
p=ROOT/'deployment/docker/compose.yml';data=yaml.safe_load(p.read_text());volumes=data['services']['api'].setdefault('volumes',[])
if not any(isinstance(v,dict) and v.get('target')=='/run/olamide-vpn' or isinstance(v,str) and len(v.split(':'))>1 and v.split(':')[1]=='/run/olamide-vpn' for v in volumes):
 volumes.append({'type':'bind','source':'/run/olamide-vpn','target':'/run/olamide-vpn','read_only':True})
groups=data['services']['api'].setdefault('group_add',[])
if '20001' not in [str(g) for g in groups]:groups.append('20001')
p.write_text(yaml.safe_dump(data,sort_keys=False))
print('VPN host configuration created; secrets retained privately.')
