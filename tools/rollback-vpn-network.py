#!/usr/bin/env python3
import json,subprocess
for family,name in [('inet','olamide_vpn'),('ip','olamide_vpn_nat')]:subprocess.run(['nft','delete','table',family,name],capture_output=True)
for chain in ['input','forward']:
 p=subprocess.run(['nft','-j','-a','list','chain','inet','olamide_guard',chain],capture_output=True,text=True)
 if p.returncode:continue
 for item in json.loads(p.stdout)['nftables']:
  r=item.get('rule',{})
  if r.get('comment','').startswith('olamide-vpn-'):subprocess.run(['nft','delete','rule','inet','olamide_guard',chain,'handle',str(r['handle'])],capture_output=True)
