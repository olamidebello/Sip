#!/usr/bin/env python3
import json,sys,shutil
from pathlib import Path
changes=json.loads("[[\"import \\\"./style.css\\\";\",\"import \\\"./style.css\\\";\\nlet smsConversations;\\nimport {setupSmsConversations} from './smsConversations.js';\\nimport './smsConversations.css';\"],[\"async function refreshExternalSms(){\",\"smsConversations=setupSmsConversations({document});\\nasync function refreshExternalSms(){\"],[\"  for(const [target,records,direction] of [['#sms-inbox',inbox.messages,'from'],['#sms-sent',sent.messages,'to']]){\\n    const node=$(target);node.replaceChildren();\\n    for(const message of records){const item=document.createElement('p');\\n      item.textContent=`${new Date(message.received_at||message.created_at).toLocaleString()} · ${direction==='from'?'From':'To'} ${message[direction==='from'?'sender':'recipient']} · ${message.body||'(media)'} ${message.status||''}`;\\n      node.append(item);\\n    }\\n    if(!records.length)node.textContent='No messages yet.';\\n  }\",\"  smsConversations.render(inbox.messages,sent.messages);\"],[\"function resetWorkspace() {\",\"function resetWorkspace() {\\n  smsConversations?.reset();\"]]")
root=Path(sys.argv[1]);p=root/'apps/web/src/main.js';s=p.read_text()
for n,(old,new) in enumerate(changes,1):
 if n==2 and 'smsConversations=setupSmsConversations(' in s:continue
 if new in s:continue
 if s.count(old)!=1:raise SystemExit('SMS_THREAD_PATCH step='+str(n))
 s=s.replace(old,new,1)
p.write_text(s)
assets=Path(__file__).resolve().parents[1]
for name in ['smsConversations.js','smsConversations.css']:shutil.copy2(assets/'apps/web/src'/name,root/'apps/web/src'/name)
