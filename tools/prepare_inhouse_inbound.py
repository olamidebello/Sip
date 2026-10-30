"""Add a source-restricted ICN inbound route to a staged switch config."""
import pathlib,re,json,sys
def patch(s,token):
 if '# INHOUSE_ICN_INBOUND_V1' in s:
  return s.replace('is_method("INVITE") && !has_totag()', 'is_method("INVITE") && $tt == $null')
 if not re.fullmatch('[a-f0-9]{64}',token):raise ValueError('Stable bridge token required')
 if s.count('request_route {')!=1:raise ValueError('Unrecognized main request route')
 s=s.replace('request_route {','''request_route {
    # INHOUSE_ICN_INBOUND_V1
    if ($si == "196.216.253.173" && is_method("INVITE") && $tt == $null) {
        route(INHOUSE_ICN_INBOUND); exit;
    }
''',1)
 route=r'''
route[INHOUSE_ICN_INBOUND] {
    if (!($rU =~ "^([+]?23420315[0-4][0-9]{4}|020315[0-4][0-9]{4})$")) {
        sl_send_reply("404", "Unassigned in-house destination"); exit;
    }
    $var(inhouse_body) = "{\"sourceIp\":\"196.216.253.173\",\"destination\":\"" + $rU + "\"}";
    if (http_client_query("http://127.0.0.1:18080/api/switch/kamailio/icn-inbound", "$var(inhouse_body)", "Content-Type: application/json\r\nAuthorization: Bearer TOKEN", "$var(inhouse_reply)") < 0) {
        sl_send_reply("503", "Subscriber lookup unavailable"); exit;
    }
    if (!jansson_get("username", "$var(inhouse_reply)", "$var(inhouse_user)") ||
        !jansson_get("domain", "$var(inhouse_reply)", "$var(inhouse_domain)") ||
        !($var(inhouse_user) =~ "^[a-zA-Z0-9]{2,64}$") ||
        !($var(inhouse_domain) =~ "^[-a-zA-Z0-9.]{1,253}$")) {
        sl_send_reply("404", "Subscriber unavailable"); exit;
    }
    $ru = "sip:" + $var(inhouse_user) + "@" + $var(inhouse_domain);
    if (!lookup("location")) { sl_send_reply("480", "Subscriber offline"); exit; }
    record_route();
    if ($du =~ "transport=wss?" || $ru =~ "transport=wss?") { $avp(inhouse_ws) = 1; } else { $avp(inhouse_ws) = 0; }
    if (!has_body("application/sdp")) { sl_send_reply("488", "Audio SDP required"); exit; }
    if ($avp(inhouse_ws) == 1) {
        if (!rtpengine_offer("replace-origin replace-session-connection UDP/TLS/RTP/SAVPF ICE=force DTLS=passive SDES=off rtcp-mux-require")) { sl_send_reply("503", "Media unavailable"); exit; }
    } else {
        if (!rtpengine_offer("replace-origin replace-session-connection RTP/AVP ICE=remove DTLS=off SDES=off")) { sl_send_reply("503", "Media unavailable"); exit; }
    }
    t_on_reply("INHOUSE_ICN_REPLY");
    t_on_failure("INHOUSE_ICN_FAILURE");
    if (!t_relay()) { rtpengine_delete(); sl_reply_error(); }
}
onreply_route[INHOUSE_ICN_REPLY] {
    if (status=~"^(18[0-9]|2[0-9][0-9])$" && has_body("application/sdp")) {
        if (!rtpengine_answer("replace-origin replace-session-connection RTP/AVP ICE=remove DTLS=off SDES=off rtcp-mux-demux")) { drop; }
    }
}
failure_route[INHOUSE_ICN_FAILURE] { rtpengine_delete(); }
'''.replace('TOKEN',token)
 return s+'\n'+route
if __name__=='__main__':
 cfg=json.loads(pathlib.Path('/etc/olamide/billing-queue.json').read_text())
 source=pathlib.Path('/etc/kamailio/kamailio.cfg');target=pathlib.Path(sys.argv[1]);target.write_text(patch(source.read_text(),cfg['token']));target.chmod(0o640)
