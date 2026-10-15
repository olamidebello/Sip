#!/usr/bin/env python3
"""Native smoke check; credentials are read from a private file, never printed."""
import json,pathlib,http.cookiejar,urllib.request,urllib.parse,argparse,re,html.parser

def check(directory,origin='http://localhost:8089',all_menus=False):
    config=json.loads((pathlib.Path(directory)/'config.json').read_text())
    jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    page=client.open(origin+'/',timeout=30).read().decode(errors='replace')
    if 'password' not in page.lower() or 'username' not in page.lower():
        diagnostic=re.sub(r'<[^>]+>', ' ', page)
        for value in config.values():diagnostic=diagnostic.replace(str(value),'[private]')
        raise AssertionError('Native login form missing: '+re.sub(r'\s+', ' ', diagnostic)[:600])
    class LoginForm(html.parser.HTMLParser):
        action=None
        def handle_starttag(self,tag,attrs):
            a=dict(attrs)
            if tag=='form' and a.get('id')=='login_form':self.action=a.get('action')
    form=LoginForm();form.feed(page)
    assert form.action, 'Native login form action missing'
    action=urllib.parse.urljoin(origin+'/',form.action)
    parsed=urllib.parse.urlparse(action);trusted=urllib.parse.urlparse(origin)
    assert (parsed.scheme,parsed.netloc)==(trusted.scheme,trusted.netloc), 'Native login action is outside the private origin'
    payload=urllib.parse.urlencode({'username':'admin','password':config['operatorPassword']}).encode()
    response=client.open(urllib.request.Request(action,data=payload),timeout=45)
    raw=response.read()
    login=raw.decode(errors='replace')
    if 'logout' not in login.lower():
        diagnostic=re.sub(r'<[^>]+>', ' ', login)
        for value in config.values():diagnostic=diagnostic.replace(str(value),'[private]')
        raise AssertionError('Native operator login did not succeed: '+re.sub(r'\s+', ' ', diagnostic)[:600])
    class VisibleText(html.parser.HTMLParser):
        def __init__(self):
            super().__init__();self.ignored=0;self.parts=[]
        def handle_starttag(self,tag,attrs):
            if tag in ('script','style'):self.ignored+=1
        def handle_endtag(self,tag):
            if tag in ('script','style'):self.ignored=max(0,self.ignored-1)
        def handle_data(self,data):
            if not self.ignored:self.parts.append(data)
    visible=VisibleText();visible.feed(login)
    assert not re.search(r'\bASTPP\b',' '.join(visible.parts),re.I), 'Native console display branding was not applied'
    for path,label in [('/trunk/trunk_list','Trunks'),('/trunk/trunk_add','Create Trunk'),('/freeswitch/fsgateway','Gateways'),('/freeswitch/fsgateway_add','Create Gateway'),('/rates/termination_rates_list','Termination Rates'),('/rates/termination_rate_add','Create Termination Rate')]:
        body=client.open(origin+path,timeout=30).read().decode(errors='replace')
        assert label.lower() in body.lower() and ('<form' in body.lower() if 'Create ' in label else 'logout' in body.lower()), 'Native management page failed: '+path
    if all_menus:
        manifest=json.loads((pathlib.Path(__file__).resolve().parents[1]/'deployment/native-astpp/menu-wiring.json').read_text())
        report=[]
        for menu in manifest['menus']:
            row={'id':menu['id'],'path':menu['path']}
            if not menu['codeAvailable']:
                row['status']='missing_upstream_module'
            elif menu.get('httpCheck') != 'enabled':
                row['status']=menu['httpCheck']
            else:
                try:
                    response=client.open(origin+'/'+menu['path'],timeout=30)
                    body=response.read().decode(errors='replace').lower()
                    final=urllib.parse.urlparse(response.url)
                    expected=urllib.parse.urlparse(origin)
                    healthy=(final.scheme,final.netloc)==(expected.scheme,expected.netloc)
                    healthy=healthy and 'logout' in body and 'id="login_form"' not in body
                    healthy=healthy and not any(marker in body for marker in ('a database error occurred','a php error was encountered','fatal error:','404 page not found'))
                    row['status']='authenticated_page_pass' if healthy else 'failed'
                except Exception:
                    row['status']='failed'
            report.append(row)
        print(json.dumps({'menus':report,'scope':'Authenticated read-only page checks; CRUD, dynamic Ajax requests and live calls remain unverified.'},indent=2))
        if any(row['status']=='failed' for row in report):
            raise AssertionError('One or more native menu pages failed; review the menu IDs above')
    else:
        print('Native ASTPP login, trunk, gateway and termination-rate pages: PASS')
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--directory',required=True);a.add_argument('--all-menus',action='store_true');args=a.parse_args();check(args.directory,all_menus=args.all_menus)
