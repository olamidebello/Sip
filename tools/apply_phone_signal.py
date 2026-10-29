#!/usr/bin/env python3
import json,sys,shutil
from pathlib import Path
changes=json.loads("[[\"import \\\"./style.css\\\";\",\"import \\\"./style.css\\\";\\nimport {setupPhoneSignal,phoneStatusText} from './phoneSignal.js';\\nimport './phoneSignal.css';\"],[\"let sipRegistered=false;\",\"let sipRegistered=false;\\nconst phoneSignal=setupPhoneSignal({document,isReady:()=>sipRegistered&&!!phone?.isConnected()});\"],[\"connection.textContent=sipRegistered?'Connected for calls':'Connecting your SIP account…';heading.append(connection);\",\"heading.append(connection);phoneSignal.refresh();\"],[\"function status(message) { callsScreen.connectionStatus(message);$(\\\"#status\\\").textContent = message;const badge=$('#communication-status');if(badge)badge.textContent=message; }\",\"function status(message) { const text=phoneStatusText(message);callsScreen.connectionStatus(text);$(\\\"#status\\\").textContent=text;phoneSignal.refresh(); }\"]]")
root=Path(sys.argv[1]);p=root/'apps/web/src/main.js';s=p.read_text()
for n,(old,new) in enumerate(changes,1):
 if new in s:continue
 if s.count(old)!=1:raise SystemExit('PHONE_SIGNAL_PATCH step='+str(n))
 s=s.replace(old,new,1)
p.write_text(s)
assets=Path(__file__).resolve().parents[1]
for name in ['phoneSignal.js','phoneSignal.css']:shutil.copy2(assets/'apps/web/src'/name,root/'apps/web/src'/name)
