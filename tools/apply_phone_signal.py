#!/usr/bin/env python3
import json,sys,shutil,re
from pathlib import Path
changes=json.loads("[[\"import \\\"./style.css\\\";\",\"import \\\"./style.css\\\";\\nimport {setupPhoneSignal,phoneStatusText} from './phoneSignal.js';\\nimport './phoneSignal.css';\"],[\"let sipRegistered=false;\",\"let sipRegistered=false;\\nconst phoneSignal=setupPhoneSignal({document,isReady:()=>sipRegistered&&!!phone?.isConnected()});\"],[\"connection.textContent=sipRegistered?'Connected for calls':'Connecting your SIP account…';heading.append(connection);\",\"heading.append(connection);phoneSignal.refresh();\"],[\"function status(message) { callsScreen.connectionStatus(message);$(\\\"#status\\\").textContent = message;const badge=$('#communication-status');if(badge)badge.textContent=message; }\",\"function status(message) { const text=phoneStatusText(message);callsScreen.connectionStatus(text);$(\\\"#status\\\").textContent=text;phoneSignal.refresh(); }\"]]")
root=Path(sys.argv[1]);p=root/'apps/web/src/main.js';s=p.read_text()
# Reinsert one canonical import block; its location may change after SMS edits.
phone_import = r"(?m)^import\s*\{([^}]+)\}\s*from\s*['\"]\./phoneSignal\.js['\"]\s*;"
for match in re.finditer(phone_import,s):
 if any(name.strip() not in {'setupPhoneSignal','phoneStatusText'} for name in match.group(1).split(',')):
  raise SystemExit('PHONE_SIGNAL_PATCH unsupported_import=true')
s=re.sub(phone_import,'',s)
s=re.sub(r"(?m)^import\s*['\"]\./phoneSignal\.css['\"]\s*;",'',s)

for n,(old,new) in enumerate(changes,1):
 if new in s:continue
 if s.count(old)!=1:
  if n==4:
   match=re.search(r'function\s+status\s*\(\s*message\s*\)\s*\{([^{}]*)\}',s)
   if match and '#status' in match.group(1) and 'textContent' in match.group(1):
    s=s[:match.start()]+new+s[match.end():]
    continue
  raise SystemExit('PHONE_SIGNAL_PATCH step='+str(n))
 s=s.replace(old,new,1)
p.write_text(s)
assets=Path(__file__).resolve().parents[1]
for name in ['phoneSignal.js','phoneSignal.css']:shutil.copy2(assets/'apps/web/src'/name,root/'apps/web/src'/name)
