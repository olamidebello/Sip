#!/usr/bin/env python3
"""Stage a recognized paid route; never print the private live configuration."""
import pathlib,re
MARKER='# OLAMIDE_DID_PASSTHROUGH_V1'
def patch(text):
    if MARKER in text:return text
    if '# OLAMIDE_PAID_ROUTE_V1' not in text:raise ValueError('Install the paid Kamailio route first')
    start=text.index('route[OLAMIDE_PAID_CALL] {')
    end=text.index('route[OLAMIDE_PAID_FAILED]',start)
    route=text[start:end]
    response=re.search(r'jansson_get\("callerId", "(\$var\([a-zA-Z0-9_]+\))"',route)
    if not response:raise ValueError('Recognized billing response required')
    response=response[1]
    first=route.index('    if ($sht(olamide_carrier=>')
    last=route.index('    consume_credentials();',first)
    replacement='''    if (!jansson_get("provider", "RESPONSE", "$var(paid_provider)")) {
        route(OLAMIDE_PAID_FAILED); sl_send_reply("503", "Carrier authorization missing"); exit;
    }
    $var(olamide_pstn_authorized) = 1;
    if ($var(paid_provider) == "flowroute") {
        if ($sht(olamide_carrier=>$var(olamide_tenant_id)) == $null ||
            $sht(olamide_carrier=>$var(olamide_tenant_id)) == "") {
            route(OLAMIDE_PAID_FAILED); sl_send_reply("503", "Carrier not activated"); exit;
        }
        route(OLAMIDE_FLOWROUTE);
    } else if ($var(paid_provider) == "didww") {
        if (!jansson_get("carrierHost", "RESPONSE", "$var(paid_host)") ||
            !($var(paid_host) =~ "^((nyc[.]us|lac[.]us|mia[.]us|fra[.]eu|ams[.]eu|sg|hk)[.]out[.]didww[.]com)$") ||
            !($rU =~ "^[+]?[1-9][0-9]{7,14}$")) {
            route(OLAMIDE_PAID_FAILED); sl_send_reply("503", "Invalid DIDWW route"); exit;
        }
        $var(paid_number) = $(rU{re.subst,/^[+]//});
        $ru = "sip:" + $var(paid_number) + "@" + $var(paid_host);
        $du = "sip:" + $var(paid_host) + ":5060;transport=udp";
    } else {
        route(OLAMIDE_PAID_FAILED); sl_send_reply("503", "Unsupported carrier"); exit;
    }
'''.replace('RESPONSE',response)
    route=route[:first]+replacement+route[last:]
    anchor='    $avp(olamide_timeout) = $var(paid_seconds);'
    if route.count(anchor)!=1:raise ValueError('Recognized paid route timeout required')
    route=route.replace(anchor,'''    remove_hf("P-Asserted-Identity");
    remove_hf("P-Preferred-Identity");
    remove_hf("Remote-Party-ID");
    append_hf("P-Asserted-Identity: <$var(paid_from)>\\r\\n");
'''+anchor)
    return text[:start]+MARKER+'\n'+route+text[end:]
if __name__=='__main__':
    try:
        source=pathlib.Path('/etc/kamailio/kamailio.cfg')
        stage=source.parent/'.olamide-did-staged.cfg'
        stage.write_text(patch(source.read_text()));stage.chmod(0o640)
    except Exception:
        raise SystemExit('DID passthrough staging refused an unrecognized configuration; live routing unchanged')
