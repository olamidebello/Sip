#!/usr/bin/env python3
from pathlib import Path
import sys

def integrate(root):
 updates={}
 def edit(path,marker,anchor,addition,after=False):
  p=root/path;s=updates.get(p,p.read_text())
  if marker in s:return
  if s.count(anchor)!=1:raise ValueError('Unrecognized integration anchor: '+path)
  updates[p]=s.replace(anchor,anchor+addition if after else addition+anchor)
 def imp(path,line):
  p=root/path;s=updates.get(p,p.read_text())
  if line not in s:updates[p]=line+s
 imp('services/api/server.js',"import {handlePhoneSettings} from './phoneSettings.js';\n")
 imp('services/api/pstnBilling.js',"import {migratePhoneSettings} from './phoneSettings.js';\n")
 imp('services/api/kamailioHttpBridge.js',"import {phoneRoutingPolicy} from './phoneSettings.js';\n")
 imp('apps/web/src/main.js',"import {setupPhoneSettingsUi} from './phoneSettingsUi.js';\n")
 edit('services/api/server.js','// OLAMIDE_PHONE_HTTP_V1',"      if(path==='/api/softphone/access'","      // OLAMIDE_PHONE_HTTP_V1\n      if(path==='/api/account/phone-settings')return await handlePhoneSettings({req,res,user,pool,send,readJson});\n")
 edit('services/api/pstnBilling.js','// OLAMIDE_PHONE_MIGRATE_V1','export async function migratePstnBilling(pool){','\n // OLAMIDE_PHONE_MIGRATE_V1\n await migratePhoneSettings(pool);',True)
 edit('services/api/kamailioHttpBridge.js','// OLAMIDE_PHONE_LOOKUP_V1','export async function bridgeLookup(pool,path,data){',"\n // OLAMIDE_PHONE_LOOKUP_V1\n if(path==='/api/switch/kamailio/phone-policy')return phoneRoutingPolicy(pool,data);",True)
 edit('apps/web/src/main.js','// OLAMIDE_PHONE_UI_V1','dialForm.noValidate=true;',"\n// OLAMIDE_PHONE_UI_V1\nsetupPhoneSettingsUi({document,get:apiGet,request:accountRequest,show:showWorkspace,isSignedIn:()=>['user','admin','super_admin'].includes(activeRole)});",True)
 for p,s in updates.items():p.write_text(s)
 return len(updates)
if __name__=='__main__':print('Phone settings integrated:',integrate(Path(sys.argv[1])))
