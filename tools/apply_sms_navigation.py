#!/usr/bin/env python3
"""Patch recognized navigation structures while preserving commissioned source changes."""
import json,sys,shutil
from pathlib import Path
CHANGES=json.loads("[[\"apps/web/src/main.js\",\"[['chat','Chats','chat'],['messenger-updates'\",\"[['chat','Chats','chat'],['external-sms','SMS','chat'],['messenger-updates'\"],[\"apps/web/src/main.js\",\"<h2>Text messages</h2><p>Send SMS\",\"<h2>SMS</h2><p class=\\\"sms-intro\\\">Send SMS\"],[\"apps/web/src/userNavigation.js\",\"['chat','Chats'],['contact-directory'\",\"['chat','Chats'],['external-sms','SMS'],['contact-directory'\"],[\"apps/web/src/userNavigation.js\",\",['external-sms','Text messages']\",\"\"],[\"services/api/navigationPolicy.js\",\"['money','social','outbound-rates'].includes(key)\",\"['money','social','outbound-rates','external-sms'].includes(key)\"],[\"apps/web/src/main.js\",\"import \\\"./style.css\\\";\",\"import \\\"./style.css\\\";\\nimport './smsUx.css';\"],[\"apps/web/src/main.js\",\"{\\\"calling-workspace\\\":\\\"Calls\\\",\",\"{\\\"external-sms\\\":\\\"SMS\\\",\\\"calling-workspace\\\":\\\"Calls\\\",\"]]")
root=Path(sys.argv[1]); assets=Path(__file__).resolve().parents[1]
pending={}
for step,(file,old,new) in enumerate(CHANGES,1):
    p=root/file
    if p.is_symlink():raise SystemExit('Symlinked source refused')
    s=pending.get(p,p.read_text())
    if new and new in s:continue
    if not new and old not in s:continue
    if file == 'services/api/navigationPolicy.js' and old not in s:
        # Earlier commissioned releases have a different default list. Add only
        # SMS at the existing allow branch; group Hide and user overrides win.
        marker="(values.includes(true)||key==='external-sms')"
        if marker in s:continue
        gate='values.includes(false)?false:values.includes(true)'
        if s.count(gate)==1 and '...validateNavigationPolicy(decode(override))' in s:
            pending[p]=s.replace(gate,'values.includes(false)?false:'+marker,1)
            continue
    if old not in s:raise SystemExit('SMS_PATCH_ERROR step='+str(step))
    pending[p]=s.replace(old,new)
for p,s in pending.items():p.write_text(s)
shutil.copy2(assets/'apps/web/src/smsUx.css',root/'apps/web/src/smsUx.css')
