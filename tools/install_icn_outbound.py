#!/usr/bin/env python3
"""Guarded additive ICN paid routing installer. Does not replace customized sources."""
import pathlib,re,sys,shutil
HERE=pathlib.Path(__file__).resolve().parents[1]
def once(s,a,b):
 if s.count(a)!=1:raise ValueError('ICN_PATCH unrecognized_anchor')
 return s.replace(a,b,1)
def patch_billing(s):
 if '// ICN_OUTBOUND_PAID_V1' in s:return s
 anchor='  const identity='
 pos=s.find(anchor,s.find('export async function reservePstn'))
 if pos<0:raise ValueError('ICN_PATCH billing_anchor_missing')
 # Place after destination normalization, before any old carrier-identity guard.
 normalize=re.search(r'  destination=normalizeDestination\([^\n]+\);\n',s)
 if not normalize:raise ValueError('ICN_PATCH normalization_missing')
 hook="  // ICN_OUTBOUND_PAID_V1\n  const icnPaid=await reserveIcnOutbound(db,{actor,data,destination,charge:callCharge,assertWindow:assertCallingWindow,policies,allowance:internationalAllowance});if(icnPaid)return icnPaid;\n"
 s=s[:normalize.end()]+hook+s[normalize.end():]
 return "import {reserveIcnOutbound,migrateIcnOutbound} from './icnOutbound.js';\n"+once(s," }finally{if(locked)await db.query(\"SELECT RELEASE_LOCK('olamide_pstn_schema_migration')\");db.release();}"," await migrateIcnOutbound(db);\n }finally{if(locked)await db.query(\"SELECT RELEASE_LOCK('olamide_pstn_schema_migration')\");db.release();}")
def patch_switch(s):
 if '# ICN_OUTBOUND_PAID_V1' in s:return s
 for token in ['event_route[dialog:start]','event_route[dialog:end]','OLAMIDE_PAID_FAILED','18444/event','uac_replace_from','rtpengine_offer']:
  if token not in s:raise ValueError('ICN_PATCH paid_route_or_queue_missing')
 response=re.search(r'jansson_get\("callerId",\s*"(\$var\([A-Za-z0-9_]+\))"',s)
 if not response:raise ValueError('ICN_PATCH response_missing')
 resp=response[1]
 # Carry the authenticated browser session's location lease through SIP. Never
 # interpolate an unchecked SIP header into the private bridge JSON.
 if 'locationProof' not in s:
  pattern=r'(http_client_query\(\s*"http://127\.0\.0\.1:18080/api/switch/kamailio/route"\s*,\s*)(.*?)(\s*,\s*"[^"\n]*"\s*,\s*"\$var\([A-Za-z0-9_]+\)"\s*\)\s*;)'
  matches=list(re.finditer(pattern,s,re.S))
  if len(matches)!=1:raise ValueError('ICN_PATCH location_bridge_shape_missing')
  m=matches[0];expr=m[2].strip()
  if not expr.endswith('}"'):raise ValueError('ICN_PATCH location_json_shape_missing')
  expr=expr[:-2]+',\\"locationProof\\":\\"" + $var(icn_location_proof) + "\\"}"'
  before='''$var(icn_location_proof) = "";
    if ($hdr(X-Olamide-Location-Proof) =~ "^[a-f0-9]{64}$") { $var(icn_location_proof) = $hdr(X-Olamide-Location-Proof); }
    '''
  s=s[:m.start()]+before+m[1]+expr+m[3]+'\n    remove_hf("X-Olamide-Location-Proof");\n'+s[m.end():]
 hook='''
    # ICN_OUTBOUND_PAID_V1
    $var(icn_provider) = "";
    jansson_get("provider", "RESPONSE", "$var(icn_provider)");
    if ($var(icn_provider) == "icn") { route(OLAMIDE_ICN_PAID); exit; }
'''.replace('RESPONSE',resp)
 s=once(s,'route[OLAMIDE_PAID_CALL] {','route[OLAMIDE_PAID_CALL] {'+hook)
 route='''
route[OLAMIDE_ICN_PAID] {
    $var(paid_key) = $(ci{s.md5}) + $(ft{s.md5});
    if (!is_method("INVITE") || has_totag()) { sl_send_reply("403", "Initial INVITE required"); exit; }
    if (!jansson_get("maxSeconds", "RESPONSE", "$var(paid_seconds)") ||
        !jansson_get("icnDestination", "RESPONSE", "$var(icn_number)") ||
        !jansson_get("icnCallerId", "RESPONSE", "$var(icn_caller)") ||
        $var(paid_seconds) < 60 || $var(paid_seconds) > 3600 ||
        !($var(icn_number) =~ "^0[1-9][0-9]{7,11}$") ||
        !($var(icn_caller) =~ "^(0[1-9][0-9]{7,11}|[+]?234[1-9][0-9]{7,11})$")) {
        route(OLAMIDE_PAID_FAILED); sl_send_reply("503", "Invalid ICN authorization"); exit;
    }
    if ($proto == "ws" || $proto == "wss") { $avp(icn_webrtc) = 1; } else { $avp(icn_webrtc) = 0; }
    consume_credentials();
    remove_hf("X-Olamide-Location-Proof");
    record_route();
    $var(icn_from) = "sip:" + $var(icn_caller) + "@154.29.77.102";
    remove_hf("P-Asserted-Identity"); remove_hf("Remote-Party-ID");
    if (!uac_replace_from("", "$var(icn_from)")) { route(OLAMIDE_PAID_FAILED); sl_send_reply("503", "ICN identity unavailable"); exit; }
    $var(icn_pai) = "P-Asserted-Identity: <" + $var(icn_from) + ">\\r\\n";
    append_hf("$var(icn_pai)");
    $ru = "sip:" + $var(icn_number) + "@196.216.253.173:5060";
    $du = "sip:196.216.253.173:5060;transport=udp";
    force_send_socket(udp:154.29.77.102:5060);
    $avp(olamide_timeout) = $var(paid_seconds);
    $dlg_ctx(timeout_bye) = 1;
    dlg_manage();
    $dlg_var(paid_key) = $var(paid_key);
    if (!has_body("application/sdp")) { route(OLAMIDE_PAID_FAILED); sl_send_reply("488", "ICN audio SDP required"); exit; }
    if (!rtpengine_offer("replace-origin replace-session-connection RTP/AVP ICE=remove DTLS=off SDES=off rtcp-mux-demux codec-strip=all codec-offer=PCMA codec-offer=PCMU codec-offer=telephone-event")) {
        route(OLAMIDE_PAID_FAILED); sl_send_reply("503", "ICN media unavailable"); exit;
    }
    t_on_reply("ICN_MEDIA_REPLY");
    t_on_failure("ICN_PAID_FAILURE");
    if (!t_relay()) { route(OLAMIDE_PAID_FAILED); rtpengine_delete(); sl_reply_error(); }
}
onreply_route[ICN_MEDIA_REPLY] {
    if (status=~"^(18[0-9]|2[0-9][0-9])$" && has_body("application/sdp")) {
        if ($avp(icn_webrtc) == 1) {
            if (!rtpengine_answer("replace-origin replace-session-connection UDP/TLS/RTP/SAVPF ICE=force DTLS=passive SDES=off rtcp-mux-require")) { drop; }
        } else {
            if (!rtpengine_answer("replace-origin replace-session-connection RTP/AVP ICE=remove DTLS=off SDES=off")) { drop; }
        }
    }
}
failure_route[ICN_PAID_FAILURE] {
    $var(paid_key) = $(ci{s.md5}) + $(ft{s.md5});
    route(OLAMIDE_PAID_FAILED);
    rtpengine_delete();
}
'''.replace('RESPONSE',resp)
 return s+'\n'+route
def patch_server(s):
 if '// ICN_LOCATION_PROOF_V1' in s:return s
 anchor="      if(path==='/api/softphone/access'||path==='/api/softphone/authorize')"
 hook="""      // ICN_LOCATION_PROOF_V1
      if(path==='/api/softphone/icn-location-proof'&&req.method==='GET'){
        res.setHeader('Cache-Control','no-store');
        return send(res,200,await icnLocationProof(pool,user,tokenHash(currentToken(req))));
      }
"""
 return "import {icnLocationProof} from './icnOutbound.js';\n"+once(s,anchor,hook+anchor)
def patch_main(s):
 if 'ICN_LOCATION_PROOF_V1' in s:return s
 return once(s,'await phone.call(authorizedTarget);',"""/* ICN_LOCATION_PROOF_V1 */
    const icnLease=/^(?:sip:)?(?:[+]?234|0)/.test(authorizedTarget)?await apiGet('/api/softphone/icn-location-proof').catch(()=>null):null;
    const icnHeaders=/^[a-f0-9]{64}$/.test(icnLease?.proof||'')?['X-Olamide-Location-Proof: '+icnLease.proof]:[];
    await phone.call(authorizedTarget,{extraHeaders:icnHeaders});""")
def main():
 root=pathlib.Path(sys.argv[1]);switch=pathlib.Path(sys.argv[2]);stage=pathlib.Path(sys.argv[3])
 billing=root/'services/api/pstnBilling.js'
 server=root/'services/api/server.js';main=root/'apps/web/src/main.js'
 if any(p.is_symlink() for p in [billing,server,main,root/'services/api/icnOutbound.js',switch,stage]):raise ValueError('ICN_PATCH symlink_target_rejected')
 b=patch_billing(billing.read_text());c=patch_switch(switch.read_text());a=patch_server(server.read_text());w=patch_main(main.read_text())
 # Validate every anchor before writing any source.
 stage.write_text(c);stage.chmod(0o640)
 billing.write_text(b)
 server.write_text(a);main.write_text(w)
 shutil.copyfile(HERE/'services/api/icnOutbound.js',root/'services/api/icnOutbound.js')
 print('ICN_PATCH staged paid routing and immutable tariff snapshots')
if __name__=='__main__':main()
