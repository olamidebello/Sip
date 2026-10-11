#!/usr/bin/env python3
"""Prepare private bridge secrets and a staged config; never modify the live config."""
import pathlib,re,secrets,os,sys

def patch(text,token):
    pattern=r'http_client_query\s*\(\s*("(?:\\.|[^"\\])*")\s*,\s*("(?:\\.|[^"\\])*")\s*,\s*("(?:\\.|[^"\\])*")(?:\s*,\s*("(?:\\.|[^"\\])*"))?\s*\)\s*;'
    count=0
    def replace(m):
        nonlocal count
        if m[1] not in ('"http://127.0.0.1:18080/api/switch/kamailio/auth"','"http://127.0.0.1:18080/api/switch/kamailio/route"'):return m[0]
        count+=1
        result=m[4] or m[3]
        assert re.fullmatch(r'"\$var\([A-Za-z0-9_]+\)"',result), 'Unexpected bridge result variable'
        headers='"Content-Type: application/json\\r\\nAuthorization: Bearer '+token+'"'
        return 'http_client_query('+m[1]+', '+m[2]+', '+headers+', '+result+');'
    out=re.sub(pattern,replace,text)
    assert count==2, 'Expected exactly two recognized bridge calls; live configuration was not changed'
    return out

def main():
    source=pathlib.Path('/etc/kamailio/kamailio.cfg')
    env=pathlib.Path('/etc/olamide/secrets.env');text=env.read_text()
    def value(key):
        matches=re.findall(r'^'+key+r'=(.*)$',text,re.M)
        assert len(matches)<=1, 'Duplicate environment key'
        return matches[0] if matches else None
    key=value('SIP_CREDENTIAL_KEY')
    assert re.fullmatch('[0-9a-fA-F]{64}',key or ''), 'Valid existing SIP encryption key required; run SIP login prerequisites first'
    token=value('KAMAILIO_HTTP_BRIDGE_TOKEN') or secrets.token_hex(32)
    assert re.fullmatch('[0-9a-f]{64}',token), 'Invalid existing bridge token'
    staged=patch(source.read_text(),token)
    for k,v in {'KAMAILIO_HTTP_BRIDGE_TOKEN':token,'KAMAILIO_HTTP_BRIDGE_ENABLED':'true','SIP_PROVISION_MODE':'kamailio_local'}.items():
        if re.search(r'^'+k+r'=',text,re.M):text=re.sub(r'^'+k+r'=.*$',k+'='+v,text,flags=re.M)
        else:text+='\n'+k+'='+v+'\n'
    tmp=env.with_suffix('.bridge.tmp');tmp.write_text(text);os.chmod(tmp,0o600);tmp.replace(env)
    target=source.parent/'.olamide-bridge.cfg';target.write_text(staged);os.chmod(target,0o600)
    print('Prepared private bridge and staged configuration')
if __name__=='__main__':main()
