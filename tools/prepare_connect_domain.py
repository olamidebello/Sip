#!/usr/bin/env python3
"""Append a reviewed HTTPS web alias without modifying canonical SIP routes."""
from pathlib import Path
import sys
MARKER='# OLAMIDE_CONNECT_WEB_ALIAS_V1'
BLOCK='''# OLAMIDE_CONNECT_WEB_ALIAS_V1
olamideconnect.com, www.olamideconnect.com {
  redir https://sip.dobhrap.com{uri} 302
}
'''
def patch(source):
 if MARKER in source:
  if source.count(MARKER)!=1 or BLOCK not in source:raise ValueError('Existing alias requires review')
  return source
 if 'olamideconnect.com' in source:raise ValueError('Unmanaged domain configuration exists')
 if '{$DOMAIN}' not in source and 'sip.dobhrap.com' not in source:raise ValueError('Canonical SIP web host is missing')
 return source+('\n' if source.endswith('\n') else '\n\n')+BLOCK
if __name__=='__main__':
 try:
  src,dest=map(Path,sys.argv[1:]);dest.write_text(patch(src.read_text()));dest.chmod(0o600)
 except Exception:raise SystemExit('Domain staging refused; existing configuration unchanged')
