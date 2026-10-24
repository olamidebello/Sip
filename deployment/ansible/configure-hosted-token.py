"""Preserve one private bridge token across the existing Compose deployment."""
import os,re,secrets
from pathlib import Path

def main():
 if os.geteuid()!=0:raise RuntimeError('Run as root on the SIP server')
 paths=[Path('/etc/olamide/secrets.env'),Path('/opt/olamide/repo/deployment/docker/.env')]
 export=Path('/root/dobhrap-sip-bridge-token');found=[]
 for p in [*paths,export]:
  if p.is_symlink():raise RuntimeError('Refuse symbolic link for private configuration')
  if p.exists():
   if p.stat().st_uid!=0 or p.stat().st_mode&0o077:raise RuntimeError('Private configuration must be root-owned and mode 0600')
   if p==export:values=[p.read_text().strip()]
   else:values=re.findall(r'^DOBHRAP_BRIDGE_TOKEN=(.*)$',p.read_text(),re.M)
   found.extend(v.strip() for v in values if v.strip())
 if any(not re.fullmatch('[a-f0-9]{64}',v) for v in found):raise RuntimeError('Existing bridge token format needs operator review')
 if len(set(found))>1:raise RuntimeError('Bridge tokens differ; reconcile without rotating managed identities')
 token=found[0] if found else secrets.token_hex(32)
 for p in paths:
  if not p.is_file():raise RuntimeError('Existing deployment environment is missing')
 for p in paths:
  text=re.sub(r'^DOBHRAP_BRIDGE_TOKEN=.*\n?', '',p.read_text(),flags=re.M).rstrip()+'\nDOBHRAP_BRIDGE_TOKEN='+token+'\n'
  fd=os.open(p,os.O_WRONLY|os.O_TRUNC,0o600)
  with os.fdopen(fd,'w') as f:f.write(text)
  os.chmod(p,0o600)
 fd=os.open(export,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
 with os.fdopen(fd,'w') as f:f.write(token+'\n')
 os.chmod(export,0o600)
 print('Private bridge token preserved and synchronized; no token printed')
if __name__=='__main__':main()
