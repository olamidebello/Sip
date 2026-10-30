import pathlib,re,sys,shutil
def once(s,a,b):
 if s.count(a)!=1:raise ValueError('INHOUSE_CONTROLS_PATCH unknown layout')
 return s.replace(a,b,1)
def server(s):
 if '// INHOUSE_CONTROLS_V1' in s:return s
 s="import {handleInhouseActivationAdmin} from './inhouseActivation.js';\nimport {migrateAlertBroadcasts,handleAlertBroadcasts} from './alertBroadcasts.js';\nimport {handleSystemAlerts} from './systemAlerts.js';\n"+s
 s=once(s,'await migrateInhouseSubscribers(pool);','await migrateInhouseSubscribers(pool);\n// INHOUSE_CONTROLS_V1\nawait migrateAlertBroadcasts(pool);')
 return once(s,"      if(path==='/api/softphone/inhouse-verification')", "      if(path==='/api/admin/inhouse-activation')return await handleInhouseActivationAdmin({req,res,user,pool,send,readJson});\n      if(path==='/api/admin/system-alerts')return await handleAlertBroadcasts({req,res,user,pool,send,readJson});\n      if(path==='/api/account/system-alerts')return await handleSystemAlerts({req,res,user,pool,send});\n      if(path==='/api/softphone/inhouse-verification')")
def mainjs(s):
 if '// INHOUSE_CONTROLS_V1' in s:return s
 s="import {setupInhouseActivationAdmin} from './inhouseActivationAdmin.js';\nimport {setupSystemAlerts} from './systemAlerts.js';\nimport {setupAlertBroadcastsAdmin} from './alertBroadcastsAdmin.js';\n"+s
 return once(s,'setupInhouseVerification({document,get:apiGet,request:accountRequest});',"""setupInhouseVerification({document,get:apiGet,request:accountRequest});
// INHOUSE_CONTROLS_V1
setupInhouseActivationAdmin({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin'});
setupAlertBroadcastsAdmin({document,get:apiGet,request:accountRequest,isSuper:()=>activeRole==='super_admin'});
setupSystemAlerts({document,get:apiGet,getUserId:()=>softphoneUserId});""")
def billing(s):
 if '// INHOUSE_FIRST_CALL_V1' in s:return s
 s="import {assertFirstCallDestination,completeInhouseFirstCall} from './inhouseActivation.js';\n"+s
 m=re.search(r'  destination=normalizeDestination\([^\n]+\);\n',s)
 if not m:raise ValueError('Destination normalization anchor missing')
 s=s[:m.end()]+"  // INHOUSE_FIRST_CALL_V1\n  await assertFirstCallDestination(db,actor,destination);\n"+s[m.end():]
 return once(s,"await db.query('COMMIT');return [200,{settled:true,chargedCents:charge,refundedCents:refund}];","await db.query('COMMIT');try{await completeInhouseFirstCall(pool,data.callKey);}catch{console.warn('INHOUSE_FIRST_CALL completion pending');}return [200,{settled:true,chargedCents:charge,refundedCents:refund}];")
if __name__=='__main__':
 root=pathlib.Path(sys.argv[1]);here=pathlib.Path(__file__).resolve().parents[1];pending=[]
 for path,fn in [('services/api/server.js',server),('services/api/pstnBilling.js',billing),('apps/web/src/main.js',mainjs)]:
  p=root/path
  if p.is_symlink():raise ValueError('Symlink rejected')
  pending.append((p,fn(p.read_text())))
 for p,s in pending:p.write_text(s)
 for path in ['services/api/inhouseActivation.js','services/api/systemAlerts.js','services/api/alertBroadcasts.js','apps/web/src/inhouseActivationAdmin.js','apps/web/src/systemAlerts.js','apps/web/src/alertBroadcastsAdmin.js']:shutil.copyfile(here/path,root/path)
