#!/usr/bin/env python3
"""Owns only VPN-specific rules; --check validates without applying firewall changes."""
import importlib.util,ipaddress,json,re,subprocess,sys
from pathlib import Path

def run(args,data=None,check=True):
 r=subprocess.run(args,input=data,text=True,capture_output=True)
 if check and r.returncode:
  detail=(r.stderr or r.stdout or 'No command diagnostic returned').strip()
  raise SystemExit('VPN network command failed: '+' '.join(args)+'\n'+detail)
 return r

def guard_add(chain,rule,label):
 r=run(['nft','-j','list','chain','inet','olamide_guard',chain],check=False)
 if r.returncode:return
 if label not in r.stdout:run(['nft','insert','rule','inet','olamide_guard',chain,*rule,'comment',label])

def render(config,dev):
 public=str(ipaddress.IPv4Address(config['endpoint']))
 ports=config['mediaPorts']
 if not ports:raise ValueError('Media port policy required')
 for port in ports:
  if not isinstance(port,str) or not re.fullmatch(r'[0-9]{1,5}(?:-[0-9]{1,5})?',port):raise ValueError('Invalid media port policy')
  a,*rest=map(int,port.split('-'));b=rest[0] if rest else a
  if not 1<=a<=b<=65535:raise ValueError('Invalid media port range')
 if not re.fullmatch(r'[a-zA-Z0-9_.-]{1,15}',dev):raise ValueError('Unknown public interface')
 portset='{ '+', '.join(ports)+' }'
 rules='''table inet olamide_vpn {
 chain input {
  type filter hook input priority -30; policy accept;
  iifname "wg-olamide" ip daddr PUBLIC udp dport PORTS accept
  iifname "wg-olamide" counter drop
 }
 chain forward {
  type filter hook forward priority -30; policy accept;
  iifname "wg-olamide" ip saddr != 10.77.0.0/24 drop
  iifname "wg-olamide" meta nfproto ipv6 drop
  iifname "wg-olamide" oifname "wg-olamide" drop
  iifname "wg-olamide" meta l4proto { tcp, udp } ct status dnat ct original proto-dst { 80, 443 } accept
  iifname "wg-olamide" ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 224.0.0.0/4 } drop
 }
}
'''
 rules=rules.replace('PUBLIC',public).replace('PORTS',portset)
 # Rules require a newline/semicolon before closing braces in nft configuration.
 nat='''table ip olamide_vpn_nat {
 chain postrouting {
  type nat hook postrouting priority 101; policy accept;
  ip saddr 10.77.0.0/24 oifname "DEVICE" masquerade
 }
}
'''.replace('DEVICE',dev)
 return rules+nat,public,ports,portset

def apply(check_only=False):
 config=json.loads(Path('/etc/olamide/vpn/server.json').read_text())
 route=json.loads(run(['ip','-j','route','get','1.1.1.1']).stdout)[0]
 rules,public,ports,portset=render(config,route['dev'])
 prefix=''
 for family,name in [('inet','olamide_vpn'),('ip','olamide_vpn_nat')]:
  if run(['nft','list','table',family,name],check=False).returncode==0:prefix+=f'delete table {family} {name}\n'
 # Validate before touching UFW, Olamide guard rules, NAT or forwarding.
 run(['nft','-c','-f','-'],prefix+rules)
 if check_only:
  print('VPN nftables validation passed. No firewall changes applied.');return
 spec=importlib.util.spec_from_file_location('vpn_ufw',Path(__file__).with_name('vpn-ufw.py'));ufw=importlib.util.module_from_spec(spec);spec.loader.exec_module(ufw)
 ufw.apply('vpn',public,ports)
 run(['nft','-f','-'],prefix+rules)
 guard_add('input',['udp','dport','51820','accept'],'olamide-vpn-listen')
 guard_add('input',['iifname','wg-olamide','ip','daddr',public,'udp','dport',portset,'accept'],'olamide-vpn-media')
 guard_add('forward',['iifname','wg-olamide','accept'],'olamide-vpn-forward')
 guard_add('forward',['oifname','wg-olamide','ct','state','established,related','accept'],'olamide-vpn-return')
 if run(['iptables','-S','DOCKER-USER'],check=False).returncode==0:
  for args in [['-i','wg-olamide','-j','ACCEPT'],['-o','wg-olamide','-m','conntrack','--ctstate','ESTABLISHED,RELATED','-j','ACCEPT']]:
   if run(['iptables','-C','DOCKER-USER',*args],check=False).returncode!=0:run(['iptables','-I','DOCKER-USER','1',*args])
 run(['sysctl','-w','net.ipv4.ip_forward=1'])
if __name__=='__main__':
 if len(sys.argv)>1 and sys.argv[1]!='--check':raise SystemExit('Usage: vpn-network.py [--check]')
 apply('--check' in sys.argv)
