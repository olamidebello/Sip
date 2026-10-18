#!/usr/bin/env python3
"""Add bounded push wake routing to the inspected same-server registrar.

Run without --apply to validate a candidate without changing the active file.
"""
import argparse, os, re, shutil, subprocess, time
from pathlib import Path

MARKER='# OLAMIDE_LOCAL_PUSH_WAKE_V1'

def build_candidate(original, token):
    if not re.fullmatch(r'[A-Za-z0-9_-]{32,}',token):
        raise ValueError('Valid synchronized push hook token required')
    if MARKER in original:
        raise ValueError('Wake routing already installed; no changes made')
    if '# OLAMIDE_CONTACT_FIX_V1' not in original:
        raise ValueError('Validated contact-routing patch is required')
    if 'loadmodule "htable.so"' not in original:
        raise ValueError('Existing htable module is required')
    updated=original
    def replace(old,new):
        nonlocal updated
        if updated.count(old)!=1:
            raise ValueError('Unexpected registrar layout; active configuration preserved')
        updated=updated.replace(old,new,1)
    replace('loadmodule "htable.so"','''loadmodule "htable.so"
loadmodule "tmx.so"
# OLAMIDE_LOCAL_PUSH_WAKE_V1
modparam("htable","htable","olamide_wait_index=>size=10;autoexpire=50;")
modparam("htable","htable","olamide_wait_label=>size=10;autoexpire=50;")
modparam("usrloc","handle_lost_tcp",1)''')
    replace('if (!save("location")) sl_send_reply("500","Registration failed");','''if (!save("location")) { sl_send_reply("500","Registration failed"); exit; }
        route(OLAMIDE_PUSH_REGISTER);''')
    replace('$var(realm)=$fd;','''if (t_check_trans()) exit;
    $var(realm)=$fd;''')
    old='''    if (!lookup("location")) { sl_send_reply("404","Extension offline"); exit; }
    if (has_body("application/sdp") && !rtpengine_offer()) {
        sl_send_reply("488","Media unavailable"); exit;
    }
    record_route();
    t_on_reply("MEDIA_REPLY");'''
    new='''    if (has_body("application/sdp") && !rtpengine_offer()) {
        sl_send_reply("488","Media unavailable"); exit;
    }
    record_route();
    t_on_reply("MEDIA_REPLY");
    if (!lookup("location")) {
        route(OLAMIDE_PUSH_WAIT);
        exit;
    }'''
    replace(old,new)
    routes=r'''

# Only reached after caller authentication, tenant checks and the API's
# authorized extension route. Existing live contacts continue to relay normally.
route[OLAMIDE_PUSH_WAIT] {
    if (!is_method("INVITE") || $tt != $null || $rd != "sip.dobhrap.com") {
        sl_send_reply("404","Extension offline"); exit;
    }
    if (!t_newtran()) exit;
    t_set_fr(45000,45000);
    $var(wake_key)=$(ru{s.md5});
    sht_lock("olamide_wait_index=>$var(wake_key)");
    if ($sht(olamide_wait_index=>$var(wake_key)) != $null) {
        sht_unlock("olamide_wait_index=>$var(wake_key)");
        t_reply("486","Recipient already has a waiting call");
        rtpengine_delete(); exit;
    }
    t_on_failure("OLAMIDE_PUSH_FAILED");
    t_reply("100","Waiting for receiving device");
    if (!t_suspend()) {
        sht_unlock("olamide_wait_index=>$var(wake_key)");
        t_reply("500","Unable to wait for device");
        rtpengine_delete(); exit;
    }
    $sht(olamide_wait_index=>$var(wake_key))=$T(id_index);
    $sht(olamide_wait_label=>$var(wake_key))=$T(id_label);
    sht_unlock("olamide_wait_index=>$var(wake_key)");
    $var(wake_request)='{"username":"' + $rU + '","domain":"' + $rd
      + '","callIdEncoding":"base64","callId":"' + $(ci{s.encode.base64}) + '"}';
    http_client_query("http://127.0.0.1:18080/api/native-push/wake", "$var(wake_request)", "Content-Type: application/json\r\nAuthorization: Bearer __HOOK_TOKEN__", "$var(wake_response)");
    $var(wake_http_status)=$rc;
    $var(wake_queued)=0;
    jansson_get("queued","$var(wake_response)","$var(wake_queued)");
    if ($var(wake_http_status) != 202 || $var(wake_queued) == 0) {
        sht_lock("olamide_wait_index=>$var(wake_key)");
        if ($sht(olamide_wait_index=>$var(wake_key)) == $T(id_index)
            && $sht(olamide_wait_label=>$var(wake_key)) == $T(id_label)) {
            $sht(olamide_wait_index=>$var(wake_key))=$null;
            $sht(olamide_wait_label=>$var(wake_key))=$null;
            t_reply("480","No receiving device available");
            rtpengine_delete();
        }
        sht_unlock("olamide_wait_index=>$var(wake_key)");
    }
    exit;
}

# This route runs only after authenticated account-matched REGISTER save.
route[OLAMIDE_PUSH_REGISTER] {
    $var(wake_key)=$(tu{s.md5});
    sht_lock("olamide_wait_index=>$var(wake_key)");
    if ($sht(olamide_wait_index=>$var(wake_key)) == $null
        || $sht(olamide_wait_label=>$var(wake_key)) == $null) {
        sht_unlock("olamide_wait_index=>$var(wake_key)");
        return;
    }
    $var(wait_index)=$sht(olamide_wait_index=>$var(wake_key));
    $var(wait_label)=$sht(olamide_wait_label=>$var(wake_key));
    $sht(olamide_wait_index=>$var(wake_key))=$null;
    $sht(olamide_wait_label=>$var(wake_key))=$null;
    sht_unlock("olamide_wait_index=>$var(wake_key)");
    t_continue("$var(wait_index)","$var(wait_label)","OLAMIDE_PUSH_RESUME");
    return;
}

route[OLAMIDE_PUSH_RESUME] {
    if (t_is_canceled()) { rtpengine_delete(); exit; }
    if (!lookup("location")) {
        t_reply("480","Receiving device unavailable");
        rtpengine_delete(); exit;
    }
    t_on_reply("MEDIA_REPLY");
    if (!t_relay()) { rtpengine_delete(); sl_reply_error(); }
    exit;
}
failure_route[OLAMIDE_PUSH_FAILED] {
    rtpengine_delete();
}
'''
    return updated+routes.replace('__HOOK_TOKEN__',token)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',type=Path,default=Path('/etc/kamailio/kamailio.cfg'))
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    source=args.config
    result=subprocess.run(['docker','exec','docker-api-1','node','-e',
        "process.stdout.write(process.env.NATIVE_PUSH_HOOK_TOKEN||'')"],capture_output=True,text=True,check=True)
    token=result.stdout
    candidate=build_candidate(source.read_text(),token)
    staged=source.with_name(source.name+'.push-candidate')
    staged.write_text(candidate);staged.chmod(0o600)
    try:
        checked=subprocess.run(['kamailio','-c','-f',str(staged)],capture_output=True,text=True)
        if checked.returncode:
            print((checked.stdout+checked.stderr).replace(token,'[REDACTED]'))
            raise SystemExit('Candidate validation failed; active routing unchanged.')
        if not args.apply:
            print('Wake routing candidate validated. Active routing unchanged.')
            print('Run this script with --apply to install and restart Kamailio.')
            return
        backup=source.with_name(source.name+'.before-push-'+time.strftime('%Y%m%d-%H%M%S'))
        shutil.copy2(source,backup)
        try:
            source.write_text(candidate)
            subprocess.run(['systemctl','restart','kamailio'],check=True)
            subprocess.run(['systemctl','is-active','--quiet','kamailio'],check=True)
        except Exception:
            shutil.copy2(backup,source)
            subprocess.run(['systemctl','restart','kamailio'])
            raise SystemExit('Restart failed; original routing restored and recovery restart attempted.')
        print('Wake routing installed; Kamailio active. Backup:',backup)
        print('Reconnect both softphones. Test an offline recipient with notifications enabled.')
    finally:
        staged.unlink(missing_ok=True)

if __name__=='__main__':
    main()
