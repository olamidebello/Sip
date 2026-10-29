#!/usr/bin/env python3
"""Patch recognized navigation structures while preserving commissioned source changes."""
import json,sys,shutil
from pathlib import Path
CHANGES=json.loads("[[\"apps/web/src/main.js\",\"[['chat','Chats','chat'],['messenger-updates'\",\"[['chat','Chats','chat'],['external-sms','SMS','chat'],['messenger-updates'\"],[\"apps/web/src/main.js\",\"<h2>Text messages</h2><p>Send SMS\",\"<h2>SMS</h2><p class=\\\"sms-intro\\\">Send SMS\"],[\"apps/web/src/userNavigation.js\",\"['chat','Chats'],['contact-directory'\",\"['chat','Chats'],['external-sms','SMS'],['contact-directory'\"],[\"apps/web/src/userNavigation.js\",\",['external-sms','Text messages']\",\"\"],[\"services/api/navigationPolicy.js\",\"['money','social','outbound-rates'].includes(key)\",\"['money','social','outbound-rates','external-sms'].includes(key)\"],[\"apps/web/src/main.js\",\"import \\\"./style.css\\\";\",\"import \\\"./style.css\\\";\\nimport './smsUx.css';\"],[\"apps/web/src/main.js\",\"{\\\"calling-workspace\\\":\\\"Calls\\\",\",\"{\\\"external-sms\\\":\\\"SMS\\\",\\\"calling-workspace\\\":\\\"Calls\\\",\"]]")
root=Path(sys.argv[1]); assets=Path(__file__).resolve().parents[1]
pending={}
for file,old,new in CHANGES:
    p=root/file
    if p.is_symlink():raise SystemExit('Symlinked source refused')
    s=pending.get(p,p.read_text())
    if new and new in s:continue
    if not new and old not in s:continue
    if old not in s:raise SystemExit('Unrecognized navigation source: '+file)
    pending[p]=s.replace(old,new)
for p,s in pending.items():p.write_text(s)
shutil.copy2(assets/'apps/web/src/smsUx.css',root/'apps/web/src/smsUx.css')
