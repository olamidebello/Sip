#!/usr/bin/env python3
"""Native smoke check; credentials are read from a private file, never printed."""
import json,pathlib,http.cookiejar,urllib.request,urllib.parse,argparse,re

def check(directory,origin='http://localhost:8089'):
    config=json.loads((pathlib.Path(directory)/'config.json').read_text())
    jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    page=client.open(origin+'/',timeout=30).read().decode(errors='replace')
    if 'password' not in page.lower() or 'username' not in page.lower():
        diagnostic=re.sub(r'<[^>]+>', ' ', page)
        for value in config.values():diagnostic=diagnostic.replace(str(value),'[private]')
        raise AssertionError('Native login form missing: '+re.sub(r'\s+', ' ', diagnostic)[:600])
    payload=urllib.parse.urlencode({'username':'admin','password':config['operatorPassword']}).encode()
    login=client.open(urllib.request.Request(origin+'/login',data=payload),timeout=45).read().decode(errors='replace')
    if 'logout' not in login.lower():
        diagnostic=re.sub(r'<[^>]+>', ' ', login)
        for value in config.values():diagnostic=diagnostic.replace(str(value),'[private]')
        raise AssertionError('Native operator login did not succeed: '+re.sub(r'\s+', ' ', diagnostic)[:600])
    for path,label in [('/trunk/trunk_list','Trunks'),('/trunk/trunk_add','Create Trunk'),('/freeswitch/fsgateway','Gateways'),('/freeswitch/fsgateway_add','Create Gateway'),('/rates/termination_rates_list','Termination Rates'),('/rates/termination_rate_add','Create Termination Rate')]:
        body=client.open(origin+path,timeout=30).read().decode(errors='replace')
        assert 'logout' in body.lower() and label.lower() in body.lower(), 'Native management page failed: '+path
    print('Native ASTPP login, trunk, gateway and termination-rate pages: PASS')
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--directory',required=True);args=a.parse_args();check(args.directory)
