#!/usr/bin/env python3
"""Additive source integration; validate all anchors before writing anything."""
from pathlib import Path
import sys

def integrate(root):
    updates={}
    def edit(path, marker, anchor, insertion, before=True):
        p=root/path;s=updates.get(p,p.read_text())
        if marker in s:return
        if s.count(anchor)!=1:raise RuntimeError('Expected one integration anchor in '+path)
        s=s.replace(anchor,(insertion+anchor) if before else (anchor+insertion))
        updates[p]=s
    imports={
        'services/api/server.js':"import {handleVoicemail} from './voicemail.js';\n",
        'services/api/kamailioHttpBridge.js':"import {lookupVoicemail} from './voicemail.js';\n",
        'services/api/pstnBilling.js':"import {migrateVoicemail} from './voicemail.js';\n",
        'services/api/callAccess.js':"import {authorizeVoicemailAccess} from './voicemail.js';\n",
        'apps/web/src/main.js':"import {setupVoicemailUi} from './voicemailUi.js';\n"}
    for path,statement in imports.items():
        p=root/path;s=p.read_text()
        if statement not in s:updates[p]=statement+s
    edit('services/api/server.js','// OLAMIDE_VOICEMAIL_HTTP_V1',"      if(path==='/api/softphone/access'", "      // OLAMIDE_VOICEMAIL_HTTP_V1\n      if(path==='/api/voicemail'||path.startsWith('/api/admin/voicemail'))return await handleVoicemail({req,res,path,user,pool,send,readJson});\n")
    edit('services/api/kamailioHttpBridge.js','// OLAMIDE_VOICEMAIL_LOOKUP_V1','export async function bridgeLookup(pool,path,data){',"\n // OLAMIDE_VOICEMAIL_LOOKUP_V1\n if(path==='/api/switch/kamailio/voicemail')return lookupVoicemail(pool,data);",False)
    edit('services/api/pstnBilling.js','// OLAMIDE_VOICEMAIL_MIGRATION_V1','export async function migratePstnBilling(pool){',"\n // OLAMIDE_VOICEMAIL_MIGRATION_V1\n await migrateVoicemail(pool);",False)
    edit('services/api/callAccess.js','// OLAMIDE_VOICEMAIL_ACCESS_V1','export async function callAccess(pool,user,target) {',"\n  // OLAMIDE_VOICEMAIL_ACCESS_V1\n  const voicemail=/^sip:\\*98@([a-z0-9.-]{1,253})$/i.exec(target||'');\n  if(voicemail)return authorizeVoicemailAccess(pool,user,voicemail[1].toLowerCase());",False)
    edit('apps/web/src/main.js','// OLAMIDE_VOICEMAIL_UI_V1','dialForm.noValidate=true;',"\n// OLAMIDE_VOICEMAIL_UI_V1\nsetupVoicemailUi({document,show:showWorkspace,get:apiGet,request:accountRequest,isSignedIn:()=>['user','admin','super_admin'].includes(activeRole),isSuper:()=>activeRole==='super_admin',call:number=>{dialForm.elements.target.value=number;delete dialForm.elements.target.dataset.routeTarget;showWorkspace('calling-workspace');dialForm.requestSubmit();}});",False)
    for p,s in updates.items():p.write_text(s)
    return len(updates)
if __name__=='__main__':print('Voicemail source integrated:',integrate(Path(sys.argv[1] if len(sys.argv)>1 else '/opt/olamide/repo')),'files')
