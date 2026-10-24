#!/usr/bin/env python3
"""Add narrow Flowroute signaling exceptions without flushing existing nftables rules."""
import json,re,subprocess,sys
NETWORKS='34.226.36.32/28, 34.210.91.112/28'
COMMENT='olamide-flowroute-signaling-v1'
def plan(data):
 entries=data.get('nftables',[]);commands=[];chains=[]
 for entry in entries:
  c=entry.get('chain',{})
  if c.get('hook')!='input' or c.get('family') not in ('ip','inet'):continue
  if not all(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.-]*',c.get(k,'')) for k in ['table','name']):raise ValueError('Unsupported firewall identifier')
  chains.append(c)
 for c in chains:
  for proto in ('udp','tcp'):
   comment=COMMENT+'-'+proto
   exists=any(e.get('rule',{}).get('family')==c['family'] and e['rule'].get('table')==c['table'] and e['rule'].get('chain')==c['name'] and e['rule'].get('comment')==comment for e in entries)
   if not exists:commands.append(f'insert rule {c["family"]} {c["table"]} {c["name"]} ip saddr {{ {NETWORKS} }} {proto} dport 5060 counter accept comment "{comment}"')
 if not chains:raise ValueError('No IPv4 input base chains found')
 return commands

def main():
 data=json.loads(subprocess.run(['nft','-j','list','ruleset'],check=True,capture_output=True,text=True).stdout)
 commands=plan(data)
 if commands:
  batch='\n'.join(commands)+'\n'
  subprocess.run(['nft','--check','-f','-'],input=batch,text=True,check=True,capture_output=True)
  subprocess.run(['nft','-f','-'],input=batch,text=True,check=True,capture_output=True)
 print('FLOWROUTE_FIREWALL rules_added='+str(len(commands)))
if __name__=='__main__':
 try:main()
 except Exception:raise SystemExit('FLOWROUTE_FIREWALL failed; existing firewall rules were not flushed')
