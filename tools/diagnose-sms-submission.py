from pathlib import Path
import sys,re
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/opt/olamide/repo')
p=root/'services/api/messagingWebhooks.js';s=p.read_text()
def once(a,b):
 global s
 if s.count(a)!=1:raise SystemExit('Unknown SMS diagnostics layout; no source changed: '+a[:60])
 s=s.replace(a,b)
if '// SMS_SUBMISSION_PHASE_V1' not in s:
 pattern=r"try\s*\{\s*const response=await fetch\('https://api\.flowroute\.com/v2\.2/messages',"
 if len(re.findall(pattern,s))!=1:raise SystemExit('Unknown SMS request layout; no source changed')
 s=re.sub(pattern,lambda m:"// SMS_SUBMISSION_PHASE_V1\n    let smsSubmissionPhase='request',smsHttpStatus=null;\n    "+m[0],s)
 once('if (response.status!==202) {',"smsHttpStatus=response.status;\n      smsSubmissionPhase='response';\n      if (response.status!==202) {")
 once('const result=await response.json();',"smsSubmissionPhase='decode';\n      const result=await response.json();\n      smsSubmissionPhase='acknowledgement';")
 once('await pool.query("UPDATE flowroute_sms_outbound SET status=\'accepted\',forwarding_pending=TRUE,provider_event_id=$1 WHERE id=$2",[providerId,id]);',"smsSubmissionPhase='save_acknowledgement';\n      await pool.query(\"UPDATE flowroute_sms_outbound SET status='accepted',forwarding_pending=TRUE,provider_event_id=$1 WHERE id=$2\",[providerId,id]);")
 pattern=r'(}\s*catch\(error\)\s*\{)(\s*await pool\.query\("UPDATE flowroute_sms_outbound SET status=\'unknown\')'
 if len(re.findall(pattern,s))!=1:raise SystemExit('Unknown SMS failure layout; no source changed')
 s=re.sub(pattern,lambda m:m[1]+'''\n      const smsErrorCode=String(error.code||error.cause?.code||error.name||'Error').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64);
      console.error('OLAMIDE_SMS_SUBMISSION_FAILURE',JSON.stringify({id,phase:smsSubmissionPhase,httpStatus:smsHttpStatus,code:smsErrorCode}));'''+m[2],s)
 p.write_text(s)
 print('Safe SMS phase diagnostics installed. Existing credentials and submission behavior preserved.')
else:print('SMS phase diagnostics already installed.')
