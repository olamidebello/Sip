#!/usr/bin/env python3
"""Repair only the recognized private voicemail forwarding block."""
import pathlib, sys
from prepare_flowroute_outbound import bounds

def patch(text):
    a,b=bounds(text,'OLAMIDE_VOICEMAIL')
    route=text[a:b]
    if '# OLAMIDE_VOICEMAIL_FORWARD_V2' in route:
        return text
    anchor='    $avp(vm_done)=1;'
    for required in (anchor, '    clear_branches();', '    consume_credentials();', '"@127.0.0.1:5062"', '$du="sip:127.0.0.1:5062;transport=udp";'):
        if route.count(required) != (2 if required == '"@127.0.0.1:5062"' else 1):
            raise ValueError('Unrecognized voicemail layout; configuration unchanged')
    if not route.index(anchor) < route.index('    clear_branches();'):
        raise ValueError('Unexpected voicemail branch ordering')
    route=route.replace('    clear_branches();\n','')
    route=route.replace(anchor,'    # OLAMIDE_VOICEMAIL_FORWARD_V2\n    clear_branches();\n'+anchor)
    route=route.replace('    consume_credentials();','    remove_hf("Authorization"); remove_hf("Proxy-Authorization");')
    return text[:a]+route+text[b:]

if __name__=='__main__':
    try:
        source,dest=map(pathlib.Path,sys.argv[1:])
        dest.write_text(patch(source.read_text()))
        dest.chmod(0o600)
    except Exception:
        raise SystemExit('Voicemail staging refused: unrecognized layout; live configuration unchanged')
