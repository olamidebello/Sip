#!/usr/bin/env python3
"""Stage and validate an authenticated Flowroute DID ingress on the existing bridge layout."""
from pathlib import Path
import re,sys,subprocess,tempfile,os,datetime
MARK='# OLAMIDE_DID_INGRESS_V1'
def patch(old):
 if MARK in old:return old
 auth=re.search(r'Authorization: Bearer ([a-f0-9]{64})',old)
 if not auth or 'onreply_route[MEDIA_REPLY]' not in old or 'request_route {' not in old:raise ValueError('Expected authenticated bridge and MEDIA_REPLY routing layout unavailable')
 hook='\n    '+MARK+'\n    if (is_method("INVITE") && !has_totag() && $rU =~ "^did-[a-f0-9]{64}$") { route(OLAMIDE_DID_INBOUND); exit; }\n'
 new=old.replace('request_route {','request_route {'+hook,1)
 route=r'''
route[OLAMIDE_DID_INBOUND] {
    if (!mf_process_maxfwd_header("10")) { sl_send_reply("483", "Too Many Hops"); exit; }
    $var(did_req)="{}";
    $var(did_key)=$(ci{s.md5}) + $(ft{s.md5});
    if (!jansson_set("string", "token", "$rU", "$var(did_req)") ||
        !jansson_set("string", "sourceIp", "$si", "$var(did_req)") ||
        !jansson_set("string", "callKey", "$var(did_key)", "$var(did_req)")) {
        sl_send_reply("503", "Ingress unavailable"); exit;
    }
    http_client_query("http://127.0.0.1:18080/api/switch/kamailio/did-inbound", "$var(did_req)", "Content-Type: application/json\r\nAuthorization: Bearer TOKEN", "$var(did_resp)");
    if ($rc != 200 || !jansson_get("username", "$var(did_resp)", "$var(did_user)") ||
        !jansson_get("domain", "$var(did_resp)", "$var(did_domain)") ||
        !jansson_get("maxSeconds", "$var(did_resp)", "$var(did_seconds)")) {
        sl_send_reply("480", "DID unavailable"); exit;
    }
    if (!($var(did_user) =~ "^[a-zA-Z0-9_.-]{1,64}$") || !($var(did_domain) =~ "^[a-zA-Z0-9.-]{1,253}$")) {
        sl_send_reply("503", "Invalid DID target"); exit;
    }
    $ru="sip:" + $var(did_user) + "@" + $var(did_domain);
    if (!lookup("location")) { sl_send_reply("480", "Recipient offline"); exit; }
    record_route();
    $avp(olamide_timeout)=$var(did_seconds);
    $dlg_ctx(timeout_bye)=1;
    dlg_manage();
    if (has_body("application/sdp") && !rtpengine_offer()) { sl_send_reply("503", "Media unavailable"); exit; }
    t_on_reply("MEDIA_REPLY");
    if (!t_relay()) { rtpengine_delete(); sl_reply_error(); }
}
'''.replace('TOKEN',auth[1])
 return new+route
def main():
 path=Path('/etc/kamailio/kamailio.cfg');old=path.read_text();new=patch(old)
 if new==old:print('unchanged');return
 with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,prefix='.did-ingress-',delete=False) as f:f.write(new);tmp=Path(f.name)
 try:
  subprocess.run(['kamailio','-c','-f',str(tmp)],check=True,capture_output=True)
  if '--check' in sys.argv:print('validated');return
  backup=Path(str(path)+'.before-did-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S'));backup.write_bytes(path.read_bytes());backup.chmod(0o600)
  st=path.stat();os.chmod(tmp,st.st_mode&0o777);os.chown(tmp,st.st_uid,st.st_gid);tmp.replace(path);print('changed: DID ingress installed')
 finally:tmp.unlink(missing_ok=True)
if __name__=='__main__':main()
