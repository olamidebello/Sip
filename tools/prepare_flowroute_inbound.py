#!/usr/bin/env python3
"""Stage an authenticated DID lookup and PSTN/WebRTC media bridge for US Flowroute PoPs."""
from pathlib import Path
import re, shlex
MARKER='# OLAMIDE_FLOWROUTE_INBOUND_V1'
def patch(source, token):
    if MARKER in source:return source
    if not re.fullmatch('[a-f0-9]{64}',token):raise ValueError('Private bridge token required')
    for module in ['http_client','jansson','registrar','rtpengine','nathelper','rr','tm']:
        if not re.search(r'loadmodule\s+"(?:.*/)?'+module+r'\.so"',source):raise ValueError('Required module missing: '+module)
    if len(re.findall(r'\brequest_route\s*\{',source))!=1:raise ValueError('Expected one request route')
    hook='''
    # Trusted carrier requests use DID ownership, never the authenticated outbound billing path.
    if (is_method("INVITE") && ($tt == $null || $tt == "") && (src_ip == 34.210.91.112/28 || src_ip == 34.226.36.32/28)) {
        route(OLAMIDE_FLOWROUTE_INBOUND); exit;
    }
'''
    source=re.sub(r'(\brequest_route\s*\{)',lambda m:m[0]+hook,source,count=1)
    route=r'''
# OLAMIDE_FLOWROUTE_INBOUND_V1
route[OLAMIDE_FLOWROUTE_INBOUND] {
    if (!($rU =~ "^[+]?[1-9][0-9]{7,14}$")) { sl_send_reply("404", "DID unavailable"); exit; }
    $var(inbound_request) = "{\"sourceIp\":\"" + $si + "\",\"destination\":\"" + $rU + "\"}";
    $var(inbound_status) = http_client_query("http://127.0.0.1:18080/api/switch/kamailio/inbound", "$var(inbound_request)", "Content-Type: application/json\r\nAuthorization: Bearer TOKEN", "$var(inbound_response)");
    if ($var(inbound_status) != 200) { sl_send_reply("404", "DID unavailable"); exit; }
    if (!jansson_get("username", "$var(inbound_response)", "$var(inbound_user)") ||
        !jansson_get("domain", "$var(inbound_response)", "$var(inbound_domain)") ||
        !($var(inbound_user) =~ "^[a-zA-Z0-9+_.-]{1,64}$") || !($var(inbound_domain) =~ "^[a-zA-Z0-9.-]{1,253}$")) {
        sl_send_reply("503", "DID routing unavailable"); exit;
    }
    $ru = "sip:" + $var(inbound_user) + "@" + $var(inbound_domain);
    if (!lookup("location")) { sl_send_reply("480", "Subscriber offline"); exit; }
    if (nat_uac_test("64")) { add_contact_alias(); }
    record_route();
    if (has_body("application/sdp") && !rtpengine_offer("replace-origin replace-session-connection UDP/TLS/RTP/SAVPF ICE=force DTLS=passive SDES=off rtcp-mux-require")) {
        sl_send_reply("503", "Media unavailable"); exit;
    }
    t_on_reply("FLOWROUTE_INBOUND_REPLY");
    t_on_failure("FLOWROUTE_INBOUND_FAILED");
    if (!t_relay()) { rtpengine_delete(); sl_reply_error(); }
}
onreply_route[FLOWROUTE_INBOUND_REPLY] {
    if ($rs >= 180 && $rs < 300 && is_present_hf("Contact")) { add_contact_alias(); }
    if (has_body("application/sdp")) {
        if (!rtpengine_answer("replace-origin replace-session-connection RTP/AVP ICE=remove DTLS=off SDES=off rtcp-mux-demux")) { xlog("L_ERR", "Inbound media answer failed\n"); }
    }
}
failure_route[FLOWROUTE_INBOUND_FAILED] { rtpengine_delete(); }
'''.replace('TOKEN',token)
    return source+'\n'+route
if __name__=='__main__':
    env=Path('/etc/olamide/secrets.env').read_text();values=re.findall(r'^KAMAILIO_HTTP_BRIDGE_TOKEN=(.*)$',env,re.M)
    if len(values)!=1:raise SystemExit('Stable bridge token required')
    staged=Path('/etc/kamailio/.flowroute-inbound-staged.cfg');staged.write_text(patch(Path('/etc/kamailio/kamailio.cfg').read_text(),shlex.split(values[0])[0]));staged.chmod(0o640)
