import pathlib,re,sys,shutil
def once(s,a,b):
 if s.count(a)!=1:raise ValueError('CREDIT_PATCH unknown layout')
 return s.replace(a,b,1)
def mainjs(s):
 if '// CALL_CREDIT_V1' in s:return s
 s="import {setupCallCredit} from './callCredit.js';\n"+s
 s=once(s,'function finishCall(result) {',"// CALL_CREDIT_V1\nconst callCredit=setupCallCredit({document,get:apiGet,show:showWorkspace,isSignedIn:()=>!!softphoneUserId});\nfunction finishCall(result) {\n  callCredit.afterCall();")
 s=once(s,'let authorizedTarget=target;','let authorizedTarget=target;let creditScope=\'external\';')
 s=once(s,'authorizedTarget=access.target||target;','authorizedTarget=access.target||target;creditScope=access.scope;')
 s=once(s,'  lastDialedTarget=target;',"  if(!await callCredit.beforeCall(creditScope))return;\n  lastDialedTarget=target;")
 for call,args in [('await phone.call(authorizedTarget);',"{}"),('await phone.call(authorizedTarget,{extraHeaders:icnHeaders});','{extraHeaders:icnHeaders}')]:
  if call in s:return once(s,call,'await phone.call(authorizedTarget,'+args+',{requestDelegate:{onReject:response=>callCredit.rejected(response)}});')
 raise ValueError('CREDIT_PATCH unsupported SIP call options')
def switch(s):
 if '# CALL_CREDIT_V1' in s:return s
 pattern=r'http_client_query\(\s*"http://127\.0\.0\.1:18080/api/switch/kamailio/route"\s*,.*?,\s*"(\$var\([A-Za-z0-9_]+\))"\s*\)\s*;'
 matches=list(re.finditer(pattern,s,re.S))
 if len(matches)!=1:raise ValueError('CREDIT_PATCH private bridge query layout missing')
 m=matches[0];hook='''
    # CALL_CREDIT_V1: only the authenticated billing response can request a top-up.
    $var(call_credit_error) = "";
    jansson_get("error", "RESPONSE", "$var(call_credit_error)");
    if ($var(call_credit_error) =~ "^Insufficient credit") {
        sl_send_reply("402", "Insufficient call credit"); exit;
    }
'''.replace('RESPONSE',m[1]);return s[:m.end()]+hook+s[m.end():]
if __name__=='__main__':
 root=pathlib.Path(sys.argv[1]);stage=pathlib.Path(sys.argv[2]);here=pathlib.Path(__file__).resolve().parents[1];p=root/'apps/web/src/main.js'
 out=mainjs(p.read_text());config=switch(pathlib.Path('/etc/kamailio/kamailio.cfg').read_text());p.write_text(out);shutil.copyfile(here/'apps/web/src/callCredit.js',root/'apps/web/src/callCredit.js');stage.write_text(config);stage.chmod(0o640)
