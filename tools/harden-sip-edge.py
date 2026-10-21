#!/usr/bin/env python3
"""Add compatible browser protections to the existing SIP Caddy site."""
import re,sys
from pathlib import Path
MARKER='# OLAMIDE_SECURITY_EDGE_V1'
BLOCK='''
  # OLAMIDE_SECURITY_EDGE_V1
  header {
    -Server
    X-Content-Type-Options nosniff
    X-Frame-Options SAMEORIGIN
    Referrer-Policy strict-origin-when-cross-origin
    Strict-Transport-Security "max-age=15552000"
    Content-Security-Policy "base-uri 'self'; object-src 'none'; frame-ancestors 'self'"
  }
  @privateSwitch path /api/switch/kamailio/*
  respond @privateSwitch 404
'''
def patch(s):
    if MARKER in s:return s
    anchors=list(re.finditer(r'^(?:\{\$DOMAIN\}|sip\.dobhrap\.com)\s*\{\s*$',s,re.M))
    if len(anchors)!=1:raise ValueError('Expected one SIP site in Caddyfile; source not changed')
    pos=anchors[0].end();return s[:pos]+BLOCK+s[pos:]
if __name__=='__main__':
    p=Path(sys.argv[1]);p.write_text(patch(p.read_text()));print('SIP edge security headers and private switch-path protection staged.')
