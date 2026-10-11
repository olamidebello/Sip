#!/usr/bin/env python3
"""Wire reviewed routing markers without altering auth or media routes."""
import argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('bundle');args=p.parse_args();root=Path(args.bundle)
main=root/'kamailio.cfg';auth=root/'olamide-auth.cfg';s=main.read_text();a=auth.read_text()
if '# OLAMIDE_PUSH_LOOKUP_MISS' not in s and 'route(OLAMIDE_PUSH_WAKE);' not in s:raise SystemExit('Reviewed subscriber routing must contain # OLAMIDE_PUSH_LOOKUP_MISS after lookup failure and after media setup')
if 'save("location")' not in a:raise SystemExit('Authenticated registration route unavailable')
for mod in ['http_async_client']:
 line='loadmodule "'+mod+'.so"'
 if line not in s:s=s.replace('#!include_file "olamide-auth.cfg"',line+'\n#!include_file "olamide-auth.cfg"')
if '#!include_file "olamide-push.cfg"' not in s:s=s.replace('#!include_file "olamide-auth.cfg"','#!include_file "olamide-push.cfg"\n#!include_file "olamide-auth.cfg"')
s=s.replace('# OLAMIDE_PUSH_LOOKUP_MISS','route(OLAMIDE_PUSH_WAKE); # OLAMIDE_PUSH_LOOKUP_MISS',1) if 'route(OLAMIDE_PUSH_WAKE);' not in s else s
old='if (!save("location")) sl_reply_error();'
if 'ts_append("location", "$tu")' not in a:
 if old not in a:raise SystemExit('Registration profile changed; cannot wire a branch append safely')
 a=a.replace(old,'if (!save("location")) { sl_reply_error(); exit; }\n    ts_append("location", "$tu");')
main.write_text(s);auth.write_text(a)
