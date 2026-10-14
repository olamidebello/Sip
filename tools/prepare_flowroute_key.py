#!/usr/bin/env python3
"""Preserve or create the existing provider encryption key without displaying it."""
import os,pathlib,re,secrets,shlex

def update(text,key):
    rows=re.findall(r'^PROVIDER_CREDENTIAL_KEY=(.*)$',text,re.M)
    if len(rows)>1:raise ValueError('Duplicate provider encryption key')
    if rows:
        parts=shlex.split(rows[0],comments=True)
        if parts and parts[0] and parts[0]!=key:raise ValueError('Conflicting key; encrypted credentials must not be rotated')
        return re.sub(r'^PROVIDER_CREDENTIAL_KEY=.*$', 'PROVIDER_CREDENTIAL_KEY='+key,text,flags=re.M)
    return text.rstrip()+'\nPROVIDER_CREDENTIAL_KEY='+key+'\n'
def main():
    if os.geteuid()!=0:raise ValueError('Root required')
    paths=[pathlib.Path('/etc/olamide/secrets.env'),pathlib.Path('/opt/olamide/repo/deployment/docker/.env')]
    sources=[p.read_text() for p in paths];keys=[]
    for text in sources:
        rows=re.findall(r'^PROVIDER_CREDENTIAL_KEY=(.*)$',text,re.M)
        if len(rows)>1:raise ValueError('Duplicate encryption key')
        parts=shlex.split(rows[0],comments=True) if rows else []
        if parts and parts[0]:
            if not re.fullmatch('[a-fA-F0-9]{64}',parts[0]):raise ValueError('Invalid encryption key')
            keys.append(parts[0])
    if len(set(keys))>1:raise ValueError('Conflicting keys')
    key=keys[0] if keys else secrets.token_hex(32)
    outputs=[update(s,key) for s in sources]
    for p,content in zip(paths,outputs):
        tmp=p.with_name(p.name+'.flowroute.tmp');tmp.write_text(content);tmp.chmod(0o600);tmp.replace(p)
    print('Provider encryption key prepared without rotation')
if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Provider key preparation stopped; inspect conflicting private settings')
