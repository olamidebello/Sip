#!/usr/bin/env python3
"""Preserve DID identity when a registered Contact uses the carrier auth username."""
import pathlib,re,sys
from prepare_flowroute_outbound import bounds
MARKER='# OLAMIDE_FLOWROUTE_CALLED_DID_V1'
def patch(text,username):
 if not re.fullmatch(r'\d{8}',username):raise ValueError('Validated registration username required')
 if MARKER in text:return text
 a,b=bounds(text,'OLAMIDE_FLOWROUTE_INBOUND');route=text[a:b]
 if not re.search(r'\$rU\b',route):raise ValueError('Expected request user lookup')
 if re.search(r'\$rU\s*(?:=|\+=|-=)(?!=|~)',route):raise ValueError('Request user mutation requires reconciliation')
 if 'sourceIp' not in route:raise ValueError('Carrier source forwarding safeguard required')
 route=re.sub(r'\$rU\b','$var(fr_called_did)',route)
 i=route.index('{')+1
 selection='''
    MARKER
    $var(fr_called_did) = $rU;
    # Host-based delivery keeps the DID in Request-URI. Registered Contact
    # delivery may use the SIP account username there; preserve the called DID.
    if ($rU == "USERNAME") {
        if (!($tU =~ "^[+]?[1-9][0-9]{7,14}$") || $tU == "USERNAME") {
            sl_send_reply("484", "Called DID required"); exit;
        }
        $var(fr_called_did) = $tU;
    }
'''.replace('MARKER',MARKER).replace('USERNAME',username)
 route=route[:i]+selection+route[i:]
 return text[:a]+route+text[b:]
if __name__=='__main__':
 try:
  import json
  config=json.loads(pathlib.Path('/etc/olamide/flowroute-registration.json').read_text())
  source=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);out.write_text(patch(source.read_text(),config['username']));out.chmod(0o640)
 except Exception:raise SystemExit('Inbound called-DID staging refused; existing switch configuration unchanged')
