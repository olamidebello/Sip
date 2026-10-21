#!/usr/bin/env python3
"""Owns only olamide_vpn NAT/filter tables and named accept rules in our guard."""
import json,subprocess,sys
from pathlib import Path

def run(args,data=None,check=True):
 r=subprocess.run(args,input=data,text=True,capture_output=True)
 if check and r.returncode:raise SystemExit('VPN network command failed: '+args[0])
 return r

def guard_add(chain,rule,label):
 r=run(['nft','-j','list','chain','inet','olamide_guard',chain],check=False)
 if r.returncode:return
 if label not in r.stdout:run(['nft','insert','rule','inet','olamide_guard',chain,*rule,'comment',label])

def apply():
 config=json.loads(Path('/etc/olamide/vpn/server.json').read_text())
 ports=config['mediaPorts']
 if not ports or any(not all(c.isdigit() or c=='-' for c in p) for p in ports):raise SystemExit('Invalid media port policy')
 portset='{ '+', '.join(ports)+' }'
 public=config['endpoint']
 if not all(c.isdigit() or c=='.' for c in public):raise SystemExit('Public IPv4 required')
 route=json.loads(run(['ip','-j','route','get','1.1.1.1']).stdout)[0];dev=route['dev']
 if not dev.replace('-','').replace('.','').replace('_','').isalnum():raise SystemExit('Unknown public interface')
 guard_add('input',['udp','dport','51820','accept'],'olamide-vpn-listen')
 guard_add('input',['iifname','wg-olamide','ip','daddr',public,'udp','dport',portset,'accept'],'olamide-vpn-media')
 guard_add('forward',['iifname','wg-olamide','accept'],'olamide-vpn-forward')
 guard_add('forward',['oifname','wg-olamide','ct','state','established,related','accept'],'olamide-vpn-return')
 # VPN clients cannot access host management ports or private networks.
 rules='''table inet olamide_vpn {
 chain input { type filter hook input priority -30; policy accept;
  iifname "wg-olamide" ip daddr PUBLIC udp dport PORTS accept
  iifname "wg-olamide" counter drop
 }
 chain forward { type filter hook forward priority -30; policy accept;
  iifname "wg-olamide" ip saddr != 10.77.0.0/24 drop
  iifname "wg-olamide" meta nfproto ipv6 drop
  iifname "wg-olamide" oifname "wg-olamide" drop
  iifname "wg-olamide" ct status dnat ct original proto-dst { 80, 443 } accept
  iifname "wg-olamide" ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 224.0.0.0/4 } drop
 }
}
'''
 rules=rules.replace('PUBLIC',public).replace('PORTS',portset)
 nat='table ip olamide_vpn_nat { chain postrouting { type nat hook postrouting priority 101; policy accept; ip saddr 10.77.0.0/24 oifname "'+dev+'" masquerade } }\n'
 prefix=''
 for family,name in [('inet','olamide_vpn'),('ip','olamide_vpn_nat')]:
  if run(['nft','list','table',family,name],check=False).returncode==0:prefix+=f'delete table {family} {name}\n'
 run(['nft','-c','-f','-'],prefix+rules+nat);run(['nft','-f','-'],prefix+rules+nat)
 run(['sysctl','-w','net.ipv4.ip_forward=1'])
if __name__=='__main__':apply()
