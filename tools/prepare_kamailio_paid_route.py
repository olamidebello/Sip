#!/usr/bin/env python3
"""Patch the recognized HTTP bridge route; reject unknown live configurations."""
import json,pathlib,re,shlex
MARKER='# OLAMIDE_PAID_ROUTE_V1'

def patch(text,token):
    if MARKER in text:return text
    if 'OLAMIDE_CARRIER_ADAPTER_V1' not in text:raise ValueError('Install Kamailio carrier adapter first')
    if re.search(r'loadmodule\s+"(?:.*/)?(?:dialog|uac)\.so"',text):raise ValueError('Existing dialog/uac settings require review')
    # Add the stable reservation key to the existing authenticated route lookup.
    pattern=r'(\$var\(req\)\s*=)(.*?)(;\s*http_client_query\(\s*"http://127\.0\.0\.1:18080/api/switch/kamailio/route")'
    matches=list(re.finditer(pattern,text,re.S))
    if len(matches)!=1:raise ValueError('Expected one recognized route bridge request')
    m=matches[0];expression=m[2].strip()
    if not expression.endswith('"') or not expression.endswith('}"'):raise ValueError('Unknown bridge JSON shape')
    # Last JSON brace is inside the trailing string literal.
    expression=expression[:-2]+',\\"callKey\\":\\"" + $(ci{s.md5}) + $(ft{s.md5}) + "\\"}"'
    text=text[:m.start()]+m[1]+expression+m[3]+text[m.end():]
    pattern=r'if\s*\(\s*\$var\(route\)\s*!=\s*"extension"\s*\)'
    hook='''if ($var(route) == "pstn") {
        route(OLAMIDE_PAID_CALL);
        exit;
    }
    '''
    text,n=re.subn(pattern,lambda m:hook+m[0],text,count=1)
    if n!=1:raise ValueError('Expected extension route gate')
    # Numeric PSTN numbers must pass the existing pre-lookup character guard.
    pattern=r'if\s*\(!\(\$rU\s*=~\s*"[^"\n]+"\)\)'
    text,n=re.subn(pattern,'if (!($rU =~ "^([a-zA-Z0-9]{2,64}|[+][1-9][0-9]{7,14})$"))',text,count=1)
    if n!=1:raise ValueError('Destination validation guard missing')
    # UAC automatic From restoration needs Record-Route from-tag tracking.
    text,n=re.subn(r'modparam\(\s*"rr"\s*,\s*"append_fromtag"\s*,\s*[01]\s*\)', 'modparam("rr","append_fromtag",1)',text)
    if not n:
        pos=text.index('request_route');text=text[:pos]+'modparam("rr","append_fromtag",1)\n'+text[pos:]
    index=text.index('request_route')
    text=text[:index]+MARKER+'\nloadmodule "dialog.so"\nloadmodule "uac.so"\nmodparam("dialog","timeout_avp","$avp(olamide_timeout)")\nmodparam("dialog","default_timeout",3600)\nmodparam("dialog","early_timeout",120)\n'+text[index:]
    headers='Content-Type: application/json\\r\\nAuthorization: Bearer '+token
    route='''
route[OLAMIDE_PAID_CALL] {
    $var(paid_key) = $(ci{s.md5}) + $(ft{s.md5});
    $var(olamide_pstn_authorized) = 0;
    if (!jansson_get("tenantId", "$var(resp)", "$var(olamide_tenant_id)") ||
        !jansson_get("maxSeconds", "$var(resp)", "$var(paid_seconds)") ||
        !jansson_get("callerId", "$var(resp)", "$var(paid_caller_id)")) {
        sl_send_reply("503", "Paid route unavailable"); exit;
    }
    if (!($var(olamide_tenant_id) =~ "^[a-f0-9-]{36}$") ||
        $var(paid_seconds) < 60 || $var(paid_seconds) > 3600 ||
        !($var(paid_caller_id) =~ "^[+][1-9][0-9]{7,14}$")) {
        sl_send_reply("503", "Invalid paid call authorization"); exit;
    }
    if ($sht(olamide_carrier=>$var(olamide_tenant_id)) == $null ||
        $sht(olamide_carrier=>$var(olamide_tenant_id)) == "") {
        route(OLAMIDE_PAID_FAILED); sl_send_reply("503", "Carrier not activated"); exit;
    }
    $var(olamide_pstn_authorized) = 1;
    route(OLAMIDE_FLOWROUTE);
    consume_credentials();
    $var(paid_from) = "sip:" + $var(paid_caller_id) + "@" + $var(realm);
    record_route();
    if (!uac_replace_from("", "$var(paid_from)")) {
        route(OLAMIDE_PAID_FAILED); sl_send_reply("503", "Caller ID unavailable"); exit;
    }
    $avp(olamide_timeout) = $var(paid_seconds);
    $dlg_ctx(timeout_bye) = 1;
    dlg_manage();
    $dlg_var(paid_key) = $(ci{s.md5}) + $(ft{s.md5});
    if (has_body("application/sdp") && !rtpengine_offer()) {
        route(OLAMIDE_PAID_FAILED); sl_send_reply("503", "Media unavailable"); exit;
    }
    t_on_reply("MEDIA_REPLY");
    if (!t_relay()) {
        route(OLAMIDE_PAID_FAILED); rtpengine_delete(); sl_reply_error();
    }
}
route[OLAMIDE_PAID_FAILED] {
    if ($var(paid_key) != $null) {
        $var(paid_event) = "{\\"callKey\\":\\"" + $var(paid_key) + "\\",\\"event\\":\\"failed\\",\\"epoch\\":" + $Ts + "}";
        http_client_query("http://127.0.0.1:18444/event", "$var(paid_event)", "HEADERS", "$var(paid_event_resp)");
    }
}
'''.replace('HEADERS',headers)
    # Detect the existing route-response variable instead of assuming its name.
    response=re.search(r'http_client_query\(\s*"http://127\.0\.0\.1:18080/api/switch/kamailio/route"[^;]+"(\$var\([A-Za-z0-9_]+\))"\s*\)',text)
    if not response:raise ValueError('Bridge response variable missing')
    route=route.replace('$var(resp)',response[1])
    for event,name in [('start','start'),('end','end'),('failed','failed')]:
        route+='''
event_route[dialog:EVENT] {
    if ($dlg_var(paid_key) != $null) {
        $var(paid_event) = "{\\"callKey\\":\\"" + $dlg_var(paid_key) + "\\",\\"event\\":\\"NAME\\",\\"epoch\\":" + $Ts + "}";
        http_client_query("http://127.0.0.1:18444/event", "$var(paid_event)", "HEADERS", "$var(paid_event_resp)");
    }
}
'''.replace('EVENT',event).replace('NAME',name).replace('HEADERS',headers)
    return text+'\n'+route

def main():
    env=pathlib.Path('/etc/olamide/secrets.env').read_text();rows=re.findall(r'^KAMAILIO_HTTP_BRIDGE_TOKEN=(.*)$',env,re.M)
    if len(rows)!=1:raise ValueError('Stable bridge token required')
    token=shlex.split(rows[0])[0]
    if not re.fullmatch('[a-f0-9]{64}',token):raise ValueError('Invalid bridge token')
    source=pathlib.Path('/etc/kamailio/kamailio.cfg');out=patch(source.read_text(),token)
    stage=source.parent/'.olamide-paid-staged.cfg';stage.write_text(out);stage.chmod(0o640)
    cfg={'token':token,'database':'/etc/olamide/billing-events.sqlite','api':'http://127.0.0.1:18080/api/switch/kamailio/billing-event'}
    p=pathlib.Path('/etc/olamide/billing-queue.json');p.write_text(json.dumps(cfg));p.chmod(0o600)
if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Paid route staging failed; live configuration unchanged. Check recognized bridge shape and module configuration.')
