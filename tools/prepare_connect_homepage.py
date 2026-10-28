#!/usr/bin/env python3
from pathlib import Path
import sys
OLD='''# OLAMIDE_CONNECT_WEB_ALIAS_V1
olamideconnect.com, www.olamideconnect.com {
  redir https://sip.dobhrap.com{uri} 302
}
'''
NEW='''# OLAMIDE_CONNECT_MARKETING_HOME_V1
olamideconnect.com, www.olamideconnect.com {
  encode zstd gzip
  @marketing path / /welcome /welcome/ /welcome/*
  @marketing_index path / /welcome /welcome/
  handle @marketing {
    root * /srv
    rewrite @marketing_index /welcome/index.html
    file_server
  }
  handle {
    redir https://sip.dobhrap.com{uri} 302
  }
}
'''
def patch(source):
 if '# OLAMIDE_CONNECT_MARKETING_HOME_V1' in source:
  if source.count(NEW)!=1:raise ValueError('Homepage configuration requires review')
  return source
 if source.count(OLD)!=1:raise ValueError('Install the managed Connect domain alias first')
 return source.replace(OLD,NEW,1)
if __name__=='__main__':
 try:
  src,dst=map(Path,sys.argv[1:]);dst.write_text(patch(src.read_text()));dst.chmod(0o600)
 except Exception:raise SystemExit('Homepage staging refused; existing web configuration unchanged')
