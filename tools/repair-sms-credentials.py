from pathlib import Path
import re,sys
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
p=root/'services/api/messagingWebhooks.js';s=p.read_text()
if '// SMS_SAVED_CREDENTIALS_V1' not in s:
 pattern=r'const\s+access\s*=\s*process\.env\.FLOWROUTE_ACCESS_KEY\s*,\s*secretKey\s*=\s*process\.env\.FLOWROUTE_SECRET_KEY\s*;'
 if len(re.findall(pattern,s))!=1:raise SystemExit('Unknown SMS credential layout; no source changed')
 replacement='''// SMS_SAVED_CREDENTIALS_V1
    let access,secretKey;
    try{({accessKey:access,secretKey}=await smsCredentials(pool,user.tenant_id));}
    catch{return send(res,503,{error:'Flowroute messaging credentials unavailable; configure an enabled carrier account'});}'''
 s=re.sub(pattern,lambda _:replacement,s)
 s="import {smsCredentials} from './smsCredentials.js';\n"+s
# Log a safe error classification, never exception messages, headers or SMS bodies.
if '// SMS_SUBMISSION_DIAGNOSTIC_V1' not in s:
 pattern=r'(}\s*catch\(error\)\s*\{)(\s*await pool\.query\("UPDATE flowroute_sms_outbound SET status=\'unknown\')'
 if len(re.findall(pattern,s))!=1:raise SystemExit('Unknown SMS failure handler; no source changed')
 s=re.sub(pattern,lambda m:m[1]+'''\n      // SMS_SUBMISSION_DIAGNOSTIC_V1
      const diagnostic=String(error.code||error.cause?.code||error.name||'Error').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64);
      console.error('OLAMIDE_SMS_SUBMISSION_ERROR',id,diagnostic);'''+m[2],s)
p.write_text(s)
print('SMS now uses saved tenant carrier credentials. Sender ownership, daily limits and request IDs retained.')
