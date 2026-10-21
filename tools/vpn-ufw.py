#!/usr/bin/env python3
"""Add narrow, persistent UFW service rules; never disable/reset or delete user rules."""
import ipaddress,os,re,shutil,subprocess,sys

def active(runner=subprocess.run):
 if not shutil.which('ufw'):return False
 r=runner(['ufw','status'],capture_output=True,text=True,env={**os.environ,'LC_ALL':'C'})
 if r.returncode:raise RuntimeError('Could not inspect UFW status')
 return 'Status: active' in r.stdout

def vpn_rules(public,ports):
 ipaddress.IPv4Address(public)
 rules=[['allow','in','to',public,'port','51820','proto','udp','comment','Olamide VPN listener'],
 ['route','allow','in','on','wg-olamide','from','10.77.0.0/24','to','any','comment','Olamide VPN forwarding']]
 for port in ports:
  if not re.fullmatch(r'[0-9]{1,5}(?:-[0-9]{1,5})?',port):raise ValueError('Invalid VPN media port')
  bounds=[int(n) for n in port.split('-')]
  if not all(1<=n<=65535 for n in bounds) or bounds[0]>bounds[-1]:raise ValueError('Invalid port range')
  rules.append(['allow','in','on','wg-olamide','from','10.77.0.0/24','to',public,'port',port.replace('-',':'),'proto','udp','comment','Olamide VPN media'])
 return rules

def turn_rules(public):
 ipaddress.IPv4Address(public)
 return [['allow','in','to',public,'port',port,'proto',proto,'comment','Olamide TURN relay'] for port,proto in [('3478','udp'),('3478','tcp'),('49160:49260','udp')]]

def apply(kind,public,ports=(),runner=subprocess.run):
 if not active(runner):return
 rules=vpn_rules(public,ports) if kind=='vpn' else turn_rules(public)
 for rule in rules:
  r=runner(['ufw',*rule],capture_output=True,text=True,env={**os.environ,'LC_ALL':'C'})
  if r.returncode:raise RuntimeError('UFW service rule could not be installed: '+r.stderr.strip())
 print('UFW service rules applied; existing rules and UFW remain enabled.')
