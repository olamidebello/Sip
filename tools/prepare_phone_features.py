#!/usr/bin/env python3
import pathlib,re,sys
from prepare_flowroute_outbound import bounds
MARKER='# OLAMIDE_PHONE_FEATURES_V1'
def patch(s):
 if MARKER in s:return s
 a,b=bounds(s,'OLAMIDE_VOICEMAIL');vm=s[a:b]
 m=re.search(r'http_client_query\("http://127\.0\.0\.1:18080/api/switch/kamailio/voicemail",\s*"\$var\(vm_req\)",("(?:[^"\\]|\\.)*"),"\$var\(vm_body\)"\)',vm)
 if not m:raise ValueError('Private bridge anchor unavailable')
 header=m[1]
 # A dedicated profile tracks early and established inbound dialogs, never arbitrary numbers.
 if re.search(r'modparam\("dialog",\s*"profiles_with_value"',s):raise ValueError('Existing dialog profiles require review')
 s=s.replace('request_route {','modparam("dialog", "profiles_with_value", "olamide_phone")\n\nrequest_route {',1)
 for name in ['OLAMIDE_FLOWROUTE_INBOUND','OLAMIDE_DID_INBOUND']:
  a,b=bounds(s,name);r=s[a:b]
  anchor='    if (!lookup("location"))'
  if r.count(anchor)!=1:raise ValueError('Inbound lookup layout unavailable')
  r=r.replace(anchor,'    route(OLAMIDE_PHONE_INITIAL);\n'+anchor)
  offline=r'    if \(!lookup\("location"\)\) \{ route\(OLAMIDE_VOICEMAIL\); sl_send_reply\("480",\s*"[^"]+"\); exit; \}'
  replacement='''    if (!lookup("location")) {
        $var(phone_action)="voicemail";
        if ($avp(phone_forwarded)!=1) {
            $var(phone_reason)="unanswered";
            route(OLAMIDE_PHONE_QUERY);
        }
        if ($var(phone_action)!="forward") {
            route(OLAMIDE_VOICEMAIL); sl_send_reply("480","Subscriber offline"); exit;
        }
        clear_branches();
        $ru="sip:"+$var(phone_target)+"@"+$var(phone_domain);
        $du=$null;
        $avp(phone_forwarded)=1;
        if (!lookup("location")) {
            route(OLAMIDE_VOICEMAIL); sl_send_reply("480","Forwarding recipient offline"); exit;
        }
    }'''
  r,n=re.subn(offline,lambda _:replacement,r)
  if n!=1:raise ValueError('Offline fallback layout unavailable')

  anchor='    if (!t_relay())'
  if r.count(anchor)!=1:raise ValueError('Inbound relay layout unavailable')
  r=r.replace(anchor,'    dlg_manage();\n    set_dlg_profile("olamide_phone", "$var(phone_key)");\n'+anchor)
  s=s[:a]+r+s[b:]
 a,b=bounds(s,'OLAMIDE_VOICEMAIL_FAILURE');r=s[a:b]
 anchor='    if (t_check_status("408|480|486"))'
 if r.count(anchor)!=1:raise ValueError('Voicemail failure layout unavailable')
 r=r.replace(anchor,'    if ($avp(phone_forwarded) != 1 && t_check_status("408|480|486")) {\n        $var(phone_reason)="unanswered";\n        if (t_check_status("486")) $var(phone_reason)="busy";\n        route(OLAMIDE_PHONE_QUERY);\n        if ($var(phone_action)=="forward") {\n            clear_branches();\n            $ru="sip:"+$var(phone_target)+"@"+$var(phone_domain);\n            $du=$null;\n            $avp(phone_forwarded)=1;\n            if (lookup("location")) {\n                t_on_failure("OLAMIDE_VOICEMAIL_FAILED");\n                if (t_relay()) exit;\n            }\n        }\n    }\n'+anchor)
 s=s[:a]+r+s[b:]
 s+='''
# OLAMIDE_PHONE_FEATURES_V1
route[OLAMIDE_PHONE_QUERY] {
    $var(phone_action)="voicemail";
    $var(phone_req)="{}";
    jansson_set("string","username","$avp(vm_user)","$var(phone_req)");
    jansson_set("string","domain","$avp(vm_domain)","$var(phone_req)");
    jansson_set("string","reason","$var(phone_reason)","$var(phone_req)");
    $var(phone_status)=http_client_query("http://127.0.0.1:18080/api/switch/kamailio/phone-policy","$var(phone_req)",__HEADER__,"$var(phone_response)");
    if ($var(phone_status)!=200) return;
    jansson_get("action","$var(phone_response)","$var(phone_action)");
    jansson_get("ringSeconds","$var(phone_response)","$var(phone_ring)");
    jansson_get("callWaiting","$var(phone_response)","$var(phone_waiting)");
    if ($var(phone_action)=="forward") {
        if (!jansson_get("username","$var(phone_response)","$var(phone_target)") ||
            !jansson_get("domain","$var(phone_response)","$var(phone_domain)") ||
            !($var(phone_target)=~"^[a-zA-Z0-9+_.-]{1,64}$") ||
            !($var(phone_domain)=~"^[a-zA-Z0-9.-]{1,253}$")) $var(phone_action)="voicemail";
    }
}
route[OLAMIDE_PHONE_INITIAL] {
    $var(phone_key)=$avp(vm_user)+"@"+$avp(vm_domain);
    $var(phone_reason)="initial";
    route(OLAMIDE_PHONE_QUERY);
    if ($var(phone_action)=="ring" && ($var(phone_waiting)==0 || $var(phone_waiting)=="false")) {
        $var(phone_count)=0;
        get_profile_size("olamide_phone","$var(phone_key)","$var(phone_count)");
        if ($var(phone_count)>0) {
            $var(phone_reason)="busy";
            route(OLAMIDE_PHONE_QUERY);
            if ($var(phone_action)=="ring") $var(phone_action)="voicemail";
        }
    }
    if ($var(phone_action)=="voicemail") {
        route(OLAMIDE_VOICEMAIL);
        sl_send_reply("480","Subscriber unavailable"); exit;
    }
    $var(phone_ms)=$var(phone_ring)*1000;
    if ($var(phone_action)=="forward") {
        $ru="sip:"+$var(phone_target)+"@"+$var(phone_domain);
        $du=$null;
        $avp(phone_forwarded)=1;
    }
}
'''.replace('__HEADER__',header)
 # Replace only fixed per-inbound ring timers, preserving media and billing.
 for name in ['OLAMIDE_FLOWROUTE_INBOUND','OLAMIDE_DID_INBOUND']:
  a,b=bounds(s,name);r=s[a:b]
  r=r.replace('t_set_fr(45000,45000);','t_set_fr("$var(phone_ms)","$var(phone_ms)");')
  s=s[:a]+r+s[b:]
 return s
if __name__=='__main__':
 try:
  src,dest=map(pathlib.Path,sys.argv[1:]);dest.write_text(patch(src.read_text()));dest.chmod(0o600)
 except Exception:raise SystemExit('Phone feature staging refused: unrecognized routing layout; live switch unchanged')
