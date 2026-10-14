#!/usr/bin/env python3
"""Stage private Kamailio RPC and carrier route definitions without changing live routes."""
import pathlib,re
MARKER='# OLAMIDE_CARRIER_ADAPTER_V1'
ROUTE='''
route[OLAMIDE_FLOWROUTE] {
    # Caller authentication, tenant selection and billing authorization MUST precede this hook.
    if ($var(olamide_pstn_authorized) != 1) {
        sl_send_reply("403", "Paid call authorization required"); exit;
    }
    $var(carrier_config) = $sht(olamide_carrier=>$var(olamide_tenant_id));
    if ($var(carrier_config) == $null || $var(carrier_config) == "") {
        sl_send_reply("503", "Carrier not activated"); exit;
    }
    if (!($rU =~ "^[+]?[1-9][0-9]{7,14}$")) {
        sl_send_reply("403", "E164 destination required"); exit;
    }
    jansson_get("host", "$var(carrier_config)", "$var(carrier_host)");
    jansson_get("techPrefix", "$var(carrier_config)", "$var(carrier_prefix)");
    if (!($var(carrier_host) =~ "^(us-east-va|us-west-or)[.]sip[.]flowroute[.]com$") || !($var(carrier_prefix) =~ "^[0-9]{8}$")) {
        sl_send_reply("503", "Carrier unavailable"); exit;
    }
    $var(carrier_number) = $(rU{re.subst,/^[+]//});
    $ru = "sip:" + $var(carrier_prefix) + "*" + $var(carrier_number) + "@" + $var(carrier_host);
    $du = "sip:" + $var(carrier_host) + ":5060;transport=udp";
    return;
}
'''
def patch(text):
    if MARKER in text:return text
    if re.search(r'loadmodule\s+"(?:.*/)?(?:ctl|htable)\.so"',text):raise ValueError('Existing RPC/htable settings require review')
    modules='loadmodule "ctl.so"\nloadmodule "htable.so"\nmodparam("ctl", "binrpc", "unix:/run/kamailio/olamide_carrier_ctl")\nmodparam("htable", "htable", "olamide_carrier=>size=6;autoexpire=0;")\n'
    pos=text.find('request_route')
    if pos<0:raise ValueError('Request route missing')
    return text[:pos]+MARKER+'\n'+modules+text[pos:]+'\n'+ROUTE
if __name__=='__main__':
    source=pathlib.Path('/etc/kamailio/kamailio.cfg');stage=source.parent/'.olamide-carrier-staged.cfg';stage.write_text(patch(source.read_text()));stage.chmod(0o640)
