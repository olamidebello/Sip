#!/usr/bin/env python3
"""Add digest authentication only to the recognized, already commissioned paid route."""
import pathlib,re,sys
MARKER='# OLAMIDE_FLOWROUTE_DIGEST_V1'
def bounds(text,name,kind='route'):
 m=re.search(r'\b'+kind+r'\s*\[\s*'+name+r'\s*\]\s*\{',text)
 if not m:raise ValueError('Required route missing')
 start=m.start();depth=1;i=m.end();quoted=False;escape=False;comment=False
 while i<len(text):
  c=text[i]
  if comment:
   if c=='\n':comment=False
  elif escape:escape=False
  elif quoted:
   if c=='\\':escape=True
   elif c=='"':quoted=False
  elif c=='"':quoted=True
  elif c=='#':comment=True
  elif c=='{':depth+=1
  elif c=='}':
   depth-=1
   if not depth:return start,i+1
  i+=1
 raise ValueError('Unbalanced route')
def patch(text):
 if MARKER in text:
  if text.count(MARKER)!=1:raise ValueError('Duplicate patch')
  return text
 if 'OLAMIDE_PAID_ROUTE_V1' not in text or 'OLAMIDE_CARRIER_ADAPTER_V1' not in text:raise ValueError('Commission paid billing and carrier routing first')
 if not re.search(r'loadmodule\s+"(?:.*/)?uac.so"',text):raise ValueError('UAC module missing')
 if re.search(r'modparam\(\s*"uac"\s*,\s*"auth_',text):raise ValueError('Existing UAC authentication requires reconciliation')
 a,b=bounds(text,'OLAMIDE_FLOWROUTE');carrier=text[a:b]
 required=['$var(olamide_pstn_authorized) != 1','jansson_get("host"','olamide_carrier','techPrefix']
 if not all(v in carrier for v in required):raise ValueError('Unrecognized carrier authorization gate')
 old='    $ru = "sip:" + $var(carrier_prefix) + "*" + $var(carrier_number) + "@" + $var(carrier_host);'
 if carrier.count(old)!=1:raise ValueError('Unrecognized destination routing')
 new='''    $avp(fr_auth_user) = $null;
    $avp(fr_auth_pass) = $null;
    $avp(fr_auth_realm) = $null;
    $avp(fr_auth_retry) = 0;
    jansson_get("authenticationMode", "$var(carrier_config)", "$var(fr_mode)");
    if ($var(fr_mode) == "digest") {
        if (!jansson_get("sipUsername", "$var(carrier_config)", "$avp(fr_auth_user)") ||
            !jansson_get("sipPassword", "$var(carrier_config)", "$avp(fr_auth_pass)") ||
            $avp(fr_auth_pass) == "") {
            sl_send_reply("503", "Carrier credentials unavailable"); exit;
        }
        $ru = "sip:" + $var(carrier_number) + "@" + $var(carrier_host);
    } else if ($var(fr_mode) == "ip") {
        $ru = "sip:" + $var(carrier_prefix) + "*" + $var(carrier_number) + "@" + $var(carrier_host);
    } else {
        sl_send_reply("503", "Carrier authentication unavailable"); exit;
    }'''
 carrier=carrier.replace(old,new);text=text[:a]+carrier+text[b:]
 a,b=bounds(text,'OLAMIDE_PAID_CALL');paid=text[a:b]
 if 't_on_failure(' in paid:raise ValueError('Existing paid failure handling requires reconciliation')
 anchor='    t_on_reply("MEDIA_REPLY");'
 if paid.count(anchor)!=1:raise ValueError('Unrecognized paid relay')
 identity='''    remove_hf("P-Asserted-Identity");
    remove_hf("P-Preferred-Identity");
    remove_hf("Remote-Party-ID");
    append_hf("P-Asserted-Identity: <$var(paid_from)>\\r\\n");
'''
 if 'P-Asserted-Identity' not in paid:
  timeout='    $avp(olamide_timeout) = $var(paid_seconds);'
  if paid.count(timeout)!=1:raise ValueError('Unknown caller identity placement')
  paid=paid.replace(timeout,identity+timeout)
 elif not all(v in paid for v in ['remove_hf("P-Asserted-Identity")','remove_hf("P-Preferred-Identity")','remove_hf("Remote-Party-ID")','P-Asserted-Identity: <$var(paid_from)>']):raise ValueError('Unknown existing caller identity handling')
 paid=paid.replace('route[OLAMIDE_PAID_CALL] {','route[OLAMIDE_PAID_CALL] {\n    $avp(fr_auth_user) = $null;\n    $avp(fr_auth_pass) = $null;')
 paid=paid.replace(anchor,'    t_on_failure("OLAMIDE_FLOWROUTE_AUTH");\n'+anchor);text=text[:a]+paid+text[b:]
 pos=text.index('request_route')
 params=MARKER+'\nmodparam("uac","auth_username_avp","$avp(fr_auth_user)")\nmodparam("uac","auth_password_avp","$avp(fr_auth_pass)")\nmodparam("uac","auth_realm_avp","$avp(fr_auth_realm)")\n'
 text=text[:pos]+params+text[pos:]
 return text+'''
failure_route[OLAMIDE_FLOWROUTE_AUTH] {
    if (t_is_canceled()) { exit; }
    if (t_check_status("401|407") && $avp(fr_auth_user) != $null && $avp(fr_auth_retry) == 0) {
        $avp(fr_auth_retry) = 1;
        if (uac_auth()) {
            t_on_failure("OLAMIDE_FLOWROUTE_AUTH");
            if (t_relay()) { exit; }
        }
    }
    $var(paid_key) = $dlg_var(paid_key);
    route(OLAMIDE_PAID_FAILED);
    rtpengine_delete();
}
'''
if __name__=='__main__':
 try:
  src=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);result=patch(src.read_text());out.write_text(result);out.chmod(0o640)
 except Exception:raise SystemExit('Outbound staging refused: unrecognized route or authentication settings. Live configuration unchanged.')
