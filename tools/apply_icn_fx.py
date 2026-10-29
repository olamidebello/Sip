#!/usr/bin/env python3
from pathlib import Path
import sys,shutil
root=Path(sys.argv[1]);source=Path(__file__).resolve().parents[1];pending={}
def patch(name,marker,anchor,replacement):
 p=root/name
 if p.is_symlink():raise SystemExit('ICN_FX_PATCH symlink')
 text=pending.get(name,p.read_text())
 if marker in text:return
 if text.count(anchor)!=1:raise SystemExit('ICN_FX_PATCH layout='+Path(name).name)
 pending[name]=text.replace(anchor,replacement,1)
patch('services/api/server.js',"from './icnFx.js'",'import http from "node:http";',"import {migrateIcnFx,startIcnFx,handleIcnFx} from './icnFx.js';\nimport http from \"node:http\";")
patch('services/api/server.js','await migrateIcnFx(pool);','await migratePstnBilling(pool);','await migratePstnBilling(pool);\nawait migrateIcnFx(pool);')
patch('services/api/server.js','const stopIcnFx=startIcnFx(pool);','const stopRateSync=startFlowrouteRateSync(pool);','const stopIcnFx=startIcnFx(pool);\nconst stopRateSync=startFlowrouteRateSync(pool);')
patch('services/api/server.js','server.on("close",stopIcnFx);','server.on("close",stopSubscriberEmail);','server.on("close",stopIcnFx);\nserver.on("close",stopSubscriberEmail);')
anchor="      if(path.startsWith('/api/contacts/registration-alerts'))"
patch('services/api/server.js',"path==='/api/icn/fx-rates'",anchor,"      if(path==='/api/icn/fx-rates')return await handleIcnFx({req,res,user,pool,send});\n"+anchor)
patch('apps/web/src/main.js',"from './icnFxUi.js'",'import {setupConversations}',"import {setupIcnFxUi} from './icnFxUi.js';\nimport {setupConversations}")
patch('apps/web/src/main.js','setupIcnFxUi({document,','const conversations=setupConversations(',"setupIcnFxUi({document,get:apiGet,isSignedIn:()=>!!activeRole});\nconst conversations=setupConversations(")
files=['services/api/icnFx.js','services/api/icnFx.test.js','apps/web/src/icnFxUi.js']
for f in files:
 if (root/f).is_symlink():raise SystemExit('ICN_FX_PATCH symlink')
for f,text in pending.items():(root/f).write_text(text)
for f in files:shutil.copy2(source/f,root/f)
