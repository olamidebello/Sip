#!/usr/bin/env python3
from pathlib import Path
import sys

def integrate(root):
 p=root/'apps/web/src/main.js';s=p.read_text()
 statement="import {setupBackgroundCalls} from './backgroundCalls.js';\n"
 if statement not in s:s=statement+s
 marker='// OLAMIDE_BACKGROUND_CALLS_V1'
 if marker not in s:
  anchor='dialForm.noValidate=true;'
  if s.count(anchor)!=1:raise ValueError('Background calling UI requires review')
  s=s.replace(anchor,anchor+"\n"+marker+"\nsetupBackgroundCalls({document,window,isSignedIn:()=>['user','admin','super_admin'].includes(activeRole),wake:()=>{autoSip.wake();void subscriberDelivery.wake();},push:nativePush});")
 old="window.addEventListener('pagehide',()=>{void autoSip.stop();});"
 new="window.addEventListener('pagehide',event=>{if(!event.persisted)void autoSip.stop();});"
 if old in s:s=s.replace(old,new)
 elif new not in s:raise ValueError('Page lifecycle requires review')
 p.write_text(s)
if __name__=='__main__':integrate(Path(sys.argv[1]));print('Background call lifecycle and settings installed')
