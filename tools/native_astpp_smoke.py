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
    assert 'logout' in login.lower(), 'Native operator login did not succeed'
    print('Native ASTPP login and operator session: PASS')
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--directory',required=True);args=a.parse_args();check(args.directory)
