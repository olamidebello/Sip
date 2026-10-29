#!/usr/bin/env python3
import json,sys,shutil,re
from pathlib import Path
changes=json.loads("[[\"import \\\"./style.css\\\";\",\"import \\\"./style.css\\\";\\nlet smsConversations;\\nimport {setupSmsConversations} from './smsConversations.js';\\nimport './smsConversations.css';\"],[\"async function refreshExternalSms(){\",\"smsConversations=setupSmsConversations({document});\\nasync function refreshExternalSms(){\"],[\"  for(const [target,records,direction] of [['#sms-inbox',inbox.messages,'from'],['#sms-sent',sent.messages,'to']]){\\n    const node=$(target);node.replaceChildren();\\n    for(const message of records){const item=document.createElement('p');\\n      item.textContent=`${new Date(message.received_at||message.created_at).toLocaleString()} · ${direction==='from'?'From':'To'} ${message[direction==='from'?'sender':'recipient']} · ${message.body||'(media)'} ${message.status||''}`;\\n      node.append(item);\\n    }\\n    if(!records.length)node.textContent='No messages yet.';\\n  }\",\"  smsConversations.render(inbox.messages,sent.messages);\"],[\"function resetWorkspace() {\",\"function resetWorkspace() {\\n  smsConversations?.reset();\"]]")
root=Path(sys.argv[1]);p=root/'apps/web/src/main.js';s=p.read_text()
# Canonicalize only this feature's imports and binding before applying edits.
# Earlier installers used const or differently spaced imports; mixing them
# with a new let declaration caused the commissioned build to fail.
s=re.sub(r"(?m)^import\s*\{\s*setupSmsConversations\s*\}\s*from\s*['\"]\./smsConversations\.js['\"]\s*;[ \t]*\n?",'',s)
s=re.sub(r"(?m)^import\s*['\"]\./smsConversations\.css['\"]\s*;[ \t]*\n?",'',s)
s=re.sub(r"(?m)^[ \t]*(?:let|var)\s+smsConversations\s*;[ \t]*\n?",'',s)
s=re.sub(r'\b(?:const|let|var)\s+smsConversations\s*=\s*setupSmsConversations', 'smsConversations=setupSmsConversations',s)
s=re.sub(r'\bsmsConversations\s*=\s*setupSmsConversations', 'smsConversations=setupSmsConversations',s)
setup_pattern=r'(?m)^[ \t]*smsConversations\s*=\s*setupSmsConversations\([^\n]*\);[ \t]*$'
setups=list(re.finditer(setup_pattern,s))
if len(setups)>1:
    # Only collapse identical initializers, or the old bare-document initializer.
    substantive=[m.group(0).strip() for m in setups if not re.fullmatch(r'smsConversations\s*=\s*setupSmsConversations\(\{\s*document\s*\}\);',m.group(0).strip())]
    if len(set(substantive))>1:raise SystemExit('SMS_THREAD_PATCH step=2')
    keep=substantive[0] if substantive else setups[0].group(0).strip()
    s=re.sub(setup_pattern,'',s)
    s=s.replace('async function refreshExternalSms(){',keep+'\nasync function refreshExternalSms(){',1)
for n,(old,new) in enumerate(changes,1):
 if n==1 and all(part in s for part in ['let smsConversations;',"from './smsConversations.js'","import './smsConversations.css'"]):continue
 if n==2 and 'smsConversations=setupSmsConversations(' in s:continue
 if new in s:continue
 if s.count(old)!=1:raise SystemExit('SMS_THREAD_PATCH step='+str(n))
 s=s.replace(old,new,1)
if 'getUserId:()=>softphoneUserId' not in s[s.index('smsConversations=setupSmsConversations('):s.index('smsConversations=setupSmsConversations(')+500]:
 s=s.replace('smsConversations=setupSmsConversations({document','smsConversations=setupSmsConversations({document,getUserId:()=>softphoneUserId',1)
if 'call:peer=>' not in s[s.index('smsConversations=setupSmsConversations('):s.index('smsConversations=setupSmsConversations(')+500]:
 s=s.replace('smsConversations=setupSmsConversations({document',"smsConversations=setupSmsConversations({document,call:peer=>{showWorkspace('calling-workspace');dialForm.elements.target.value=peer;dialForm.elements.target.dispatchEvent(new Event('input',{bubbles:true}));callsScreen.open('keypad');}",1)
if 'getContacts:()=>apiGet(' not in s[s.index('smsConversations=setupSmsConversations('):s.index('smsConversations=setupSmsConversations(')+900]:
 s=s.replace('smsConversations=setupSmsConversations({document',"smsConversations=setupSmsConversations({document,getContacts:()=>apiGet('/api/contacts/address-book')",1)
p.write_text(s)
assets=Path(__file__).resolve().parents[1]
for name in ['smsConversations.js','smsConversations.css','smsAppearance.js','smsTools.js','smsComposer.js']:shutil.copy2(assets/'apps/web/src'/name,root/'apps/web/src'/name)
