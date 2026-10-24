#!/usr/bin/env python3
"""Read-only listener, firewall and service checks; no private configuration output."""
import json,re,subprocess

def run(args):
 try:return subprocess.run(args,capture_output=True,text=True,timeout=8)
 except Exception:return None

def emit(key,value):print('SIP_LISTENER_CHECK '+key+'='+str(value).lower())
r=run(['systemctl','is-active','kamailio']);emit('kamailio_active',bool(r and r.stdout.strip()=='active'))
r=run(['ss','-H','-lnu']);lines=[line for line in (r.stdout if r else '').splitlines() if re.search(r':5060\b',line)]
emit('udp_5060_listeners',len(lines));emit('public_udp_listener',any(re.search(r'(?:0\.0\.0\.0|\*|154\.29\.77\.102|\[::\]):5060\b',line) for line in lines))
r=run(['nft','-j','list','ruleset']);emit('nft_readable',bool(r and r.returncode==0))
if r and r.returncode==0:
 try:
  data=json.loads(r.stdout);chains=[x['chain'] for x in data.get('nftables',[]) if 'chain' in x];rules=[x['rule'] for x in data.get('nftables',[]) if 'rule' in x]
  emit('input_drop_policy',any(c.get('hook')=='input' and c.get('policy')=='drop' for c in chains))
  siprules=[x for x in rules if '5060' in json.dumps(x.get('expr',[]))]
  emit('sip_accept_rules',sum('"accept"' in json.dumps(x.get('expr',[])) for x in siprules))
  emit('sip_drop_rules',sum('"drop"' in json.dumps(x.get('expr',[])) or '"reject"' in json.dumps(x.get('expr',[])) for x in siprules))
  emit('flowroute_east_reference',any('34.226.36.' in json.dumps(x) for x in rules))
  emit('flowroute_west_reference',any('34.210.91.' in json.dumps(x) for x in rules))
 except Exception:emit('firewall_parse','failed')
r=run(['journalctl','-u','kamailio','--since','10 minutes ago','--no-pager','-o','cat'])
if r and r.returncode==0:
 for key,pattern in {'recent_errors':r'\b(?:ERROR|CRITICAL)\b','http_client_errors':r'http_client.*(?:fail|error|timeout)','invalid_sip_errors':r'(?:parse|sanity).*(?:fail|error)','socket_errors':r'(?:socket|bind).*(?:fail|error)'}.items():emit(key,len(re.findall(pattern,r.stdout,re.I)))
