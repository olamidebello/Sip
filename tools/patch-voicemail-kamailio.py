#!/usr/bin/env python3
"""Patch the reviewed Kamailio 5.6 routes without changing credentials/carriers."""
from pathlib import Path
import re,sys
MARKER='# OLAMIDE_VOICEMAIL_V1'

def block(text,kind,name=None):
    pattern=r'\b'+kind+(r'\s*\[\s*'+re.escape(name)+r'\s*\]' if name else '')+r'\s*\{'
    matches=list(re.finditer(pattern,text))
    if len(matches)!=1:raise ValueError('Expected one '+kind+' '+str(name))
    start=matches[0].end();depth=1;quote=None;comment=False;escape=False
    for i in range(start,len(text)):
        c=text[i]
        if comment:
            if c=='\n':comment=False
            continue
        if quote:
            if escape:escape=False
            elif c=='\\':escape=True
            elif c==quote:quote=None
            continue
        if c=='#':comment=True
        elif c in "\"'":quote=c
        elif c=='{':depth+=1
        elif c=='}':
            depth-=1
            if depth==0:return start,i
    raise ValueError('Unclosed route')

def once(s,old,new):
    if s.count(old)!=1:raise ValueError('Unsupported route layout: '+old[:65])
    return s.replace(old,new)

def patch(text):
    if MARKER in text:return text
    calls=re.findall(r'http_client_query\(([^;]+)\);',text,re.S)
    tokens={t for call in calls if '/api/switch/kamailio/route' in call for t in re.findall(r'Bearer\s+([a-f0-9]{64})',call)}
    if len(tokens)!=1:raise ValueError('Expected one private bridge bearer token; credentials not displayed')
    token=tokens.pop()
    def edit(kind,name,fn):
        nonlocal text
        a,b=block(text,kind,name);text=text[:a]+fn(text[a:b])+text[b:]
    # Only reached after proxy authentication and account/tenant matching.
    def initial(s):
        guard='    if (!($rU =~ "^([a-zA-Z0-9]{2,64}|[+][1-9][0-9]{7,14})$")) {'
        access='''    if ($rU == "*98") {
        $avp(vm_user)=$au; $avp(vm_domain)=$var(realm);
        $avp(vm_side)="browser"; $avp(vm_access)=1;
        route(OLAMIDE_VOICEMAIL);
        sl_send_reply("480","Voicemail unavailable"); exit;
    }
'''
        s=once(s,guard,access+guard)
        target='    $ru="sip:" + $var(target) + "@" + $var(realm);'
        s=once(s,target,target+'\n    $avp(vm_user)=$var(target); $avp(vm_domain)=$var(realm); $avp(vm_side)="browser";')
        s=once(s,'    record_route();','    record_route(); $avp(vm_rr)=1;')
        s=once(s,'    t_on_reply("MEDIA_REPLY");\n    if (!lookup("location"))','    t_on_reply("MEDIA_REPLY");\n    t_set_fr(45000,45000);\n    t_on_failure("OLAMIDE_VOICEMAIL_FAILED");\n    if (!lookup("location"))')
        return s
    edit('request_route',None,initial)
    for name,user,domain,side in [('OLAMIDE_FLOWROUTE_INBOUND','inbound_user','inbound_domain','carrier'),('OLAMIDE_DID_INBOUND','did_user','did_domain','carrier')]:
        def inbound(s,user=user,domain=domain,name=name):
            pattern=r'(\$ru\s*=\s*"sip:"\s*\+\s*\$var\('+user+r'\)\s*\+\s*"@"\s*\+\s*\$var\('+domain+r'\);)'
            s,n=re.subn(pattern,r'\1\n    $avp(vm_user)=$var('+user+'); $avp(vm_domain)=$var('+domain+'); $avp(vm_side)="carrier";',s)
            if n!=1:raise ValueError('Inbound URI layout unsupported')
            s,n=re.subn(r'(if\s*\(!lookup\("location"\)\)\s*\{)',r'\1 route(OLAMIDE_VOICEMAIL);',s)
            if n!=1:raise ValueError('Inbound offline lookup missing')
            s=once(s,'record_route();','record_route(); $avp(vm_rr)=1;')
            if name=='OLAMIDE_FLOWROUTE_INBOUND':s=once(s,'t_on_failure("FLOWROUTE_INBOUND_FAILED");','t_set_fr(45000,45000);\n    t_on_failure("FLOWROUTE_INBOUND_FAILED");')
            else:s=once(s,'t_on_reply("MEDIA_REPLY");','t_on_reply("MEDIA_REPLY");\n    t_set_fr(45000,45000);\n    t_on_failure("OLAMIDE_VOICEMAIL_FAILED");')
            return s
        edit('route',name,inbound)
    edit('failure_route','FLOWROUTE_INBOUND_FAILED',lambda s:'\n    route(OLAMIDE_VOICEMAIL_FAILURE);\n    rtpengine_delete();\n')
    edit('failure_route','OLAMIDE_PUSH_FAILED',lambda s:'\n    route(OLAMIDE_VOICEMAIL_FAILURE);\n    rtpengine_delete();\n')
    def resume(s):
        s=once(s,'t_reply("480","Receiving device unavailable");','route(OLAMIDE_VOICEMAIL); t_reply("480","Receiving device unavailable");')
        return once(s,'t_on_reply("MEDIA_REPLY");','t_on_reply("MEDIA_REPLY");\n    t_set_fr(45000,45000); t_on_failure("OLAMIDE_VOICEMAIL_FAILED");')
    edit('route','OLAMIDE_PUSH_RESUME',resume)
    # Retain the existing wake attempt. A failed wake resumes the suspended
    # transaction into voicemail, outside its htable lock, rather than replying 480.
    def wait(s):
        s=once(s,'    if ($var(wake_http_status) != 202 || $var(wake_queued) == 0) {','    $var(vm_resume)=0;\n    if ($var(wake_http_status) != 202 || $var(wake_queued) == 0) {')
        s=once(s,'            t_reply("480","No receiving device available");\n            rtpengine_delete();','            $var(vm_resume)=1;')
        anchor='        sht_unlock("olamide_wait_index=>$var(wake_key)");\n    }'
        return once(s,anchor,anchor+'\n    if ($var(vm_resume) == 1) { t_continue("$T(id_index)","$T(id_label)","OLAMIDE_VM_RESUME"); }')
    edit('route','OLAMIDE_PUSH_WAIT',wait)
    extra=r'''
# OLAMIDE_VOICEMAIL_V1
# Mailbox IDs come only from the authenticated private database lookup.
route[OLAMIDE_VOICEMAIL] {
    if ($avp(vm_done) == 1 || $avp(vm_user) == $null || $avp(vm_domain) == $null) return;
    $var(vm_req)="{}";
    if (!jansson_set("string","username","$avp(vm_user)","$var(vm_req)") ||
        !jansson_set("string","domain","$avp(vm_domain)","$var(vm_req)")) return;
    $var(vm_http)=http_client_query("http://127.0.0.1:18080/api/switch/kamailio/voicemail",
        "$var(vm_req)","Authorization: Bearer __TOKEN__\r\nContent-Type: application/json","$var(vm_body)");
    if ($var(vm_http) != 200 || !jansson_get("mailbox","$var(vm_body)","$var(vm_box)") ||
        !($var(vm_box) =~ "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")) return;
    $avp(vm_done)=1;
    if ($avp(vm_access) == 1) $ru="sip:check-" + $var(vm_box) + "@127.0.0.1:5062";
    else $ru="sip:" + $var(vm_box) + "@127.0.0.1:5062";
    $du="sip:127.0.0.1:5062;transport=udp";
    clear_branches();
    if ($avp(vm_rr) != 1) { record_route(); $avp(vm_rr)=1; }
    # No credentials or forwarding headers are passed to the private recorder.
    consume_credentials();
    remove_hf("Route"); remove_hf("Diversion"); remove_hf("History-Info");
    if (has_body("application/sdp") && !rtpengine_offer("replace-origin replace-session-connection RTP/AVP ICE=remove DTLS=off SDES=off rtcp-mux-demux")) {
        sl_send_reply("488","Voicemail media unavailable"); exit;
    }
    $avp(olamide_timeout)=600; $dlg_ctx(timeout_bye)=1; dlg_manage();
    t_set_fr(30000,30000);
    t_on_reply("OLAMIDE_VOICEMAIL_REPLY");
    t_on_failure("OLAMIDE_VOICEMAIL_FINAL");
    if (!t_relay()) { rtpengine_delete(); sl_reply_error(); }
    exit;
}
route[OLAMIDE_VOICEMAIL_FAILURE] {
    if (t_is_canceled()) return;
    if (t_check_status("408|480|486")) route(OLAMIDE_VOICEMAIL);
}
failure_route[OLAMIDE_VOICEMAIL_FAILED] {
    route(OLAMIDE_VOICEMAIL_FAILURE);
    rtpengine_delete();
}
route[OLAMIDE_VM_RESUME] {
    if (t_is_canceled()) { rtpengine_delete(); exit; }
    route(OLAMIDE_VOICEMAIL);
    t_reply("480","Recipient and voicemail unavailable"); rtpengine_delete(); exit;
}
onreply_route[OLAMIDE_VOICEMAIL_REPLY] {
    if ($rs >= 180 && $rs < 300 && is_present_hf("Contact")) add_contact_alias();
    if (has_body("application/sdp")) {
        if ($avp(vm_side) == "browser") rtpengine_answer("trust-address replace-origin replace-session-connection UDP/TLS/RTP/SAVPF ICE=force DTLS=passive SDES=off rtcp-mux-require");
        else rtpengine_answer("trust-address replace-origin replace-session-connection RTP/AVP ICE=remove DTLS=off SDES=off rtcp-mux-demux");
    }
}
failure_route[OLAMIDE_VOICEMAIL_FINAL] { rtpengine_delete(); }
'''
    return text+extra.replace('__TOKEN__',token)
if __name__=='__main__':
    if len(sys.argv)!=3:raise SystemExit('usage: patch-voicemail-kamailio.py SOURCE CANDIDATE')
    Path(sys.argv[2]).write_text(patch(Path(sys.argv[1]).read_text()))
    Path(sys.argv[2]).chmod(0o600)
