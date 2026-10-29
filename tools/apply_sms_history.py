#!/usr/bin/env python3
import json,sys,shutil
from pathlib import Path
changes=json.loads("[[\"apps/web/src/main.js\",\"setupSmsConversations({document});\",\"setupSmsConversations({document,history:body=>accountRequest('/api/external-sms/history',body)});\"],[\"apps/web/src/main.js\",\"Copy incoming SMS to SIP chat\",\"Keep SMS in the SMS tab\"],[\"apps/web/src/main.js\",\"for(const key of routingFlags)\",\"$('#subscriber-routing').elements.sms_to_chat.closest('label').hidden=true;\\n for(const key of routingFlags)\"],[\"apps/web/src/main.js\",\"for(const key of routingFlags)body[key]=event.currentTarget.elements[key].checked;\",\"for(const key of routingFlags)body[key]=key==='sms_to_chat'?false:event.currentTarget.elements[key].checked;\"],[\"services/api/messagingWebhooks.js\",\"import {acceptQuickSignup}\",\"import {handleSmsHistory} from './smsHistory.js';\\nimport {acceptQuickSignup}\"],[\"services/api/messagingWebhooks.js\",\"export async function handleExternalSms({req,res,path,user,pool,send,readJson}) {\",\"export async function handleExternalSms({req,res,path,user,pool,send,readJson}) {\\n  if(path==='/api/external-sms/history')return handleSmsHistory({req,res,path,user,pool,send,readJson});\"],[\"services/api/conversations.js\",\"WHERE ((m.sender_id=$1 AND m.recipient_id=$2)\",\"WHERE NOT EXISTS (SELECT 1 FROM subscriber_sms_deliveries sms_copy WHERE sms_copy.id=m.id) AND ((m.sender_id=$1 AND m.recipient_id=$2)\"]]")
root=Path(sys.argv[1]);pending={}
for n,(file,old,new) in enumerate(changes,1):
 p=root/file;s=pending.get(p,p.read_text())
 if new in s:continue
 if old not in s:raise SystemExit('SMS_HISTORY_PATCH step='+str(n))
 pending[p]=s.replace(old,new)
for p,s in pending.items():p.write_text(s)
assets=Path(__file__).resolve().parents[1]
for name in ['apps/web/src/smsConversations.js','services/api/smsHistory.js']:shutil.copy2(assets/name,root/name)
