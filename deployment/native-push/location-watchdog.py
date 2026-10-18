#!/usr/bin/env python3
"""End managed SIP dialogs when server location leases expire. No coordinates logged."""
import hashlib,json,re,subprocess,time,urllib.request
SOCKET='unix:/run/kamailio/olamide_carrier_ctl'
def rpc(*args):
    return subprocess.run(['kamcmd','-s',SOCKET,*args],check=True,capture_output=True,text=True,timeout=5).stdout
def dialogs(raw):
    result=[]
    for match in re.finditer(r'\bh_entry:\s*(\d+)(.*?)(?=\bh_entry:|\Z)',raw,re.S):
        block=match.group(2)
        def field(name):
            m=re.search(r'^\s*'+re.escape(name)+r':\s*([^\r\n]+)',block,re.M)
            return m.group(1).strip() if m else ''
        entry,hid,cid,tag,state=match.group(1),field('h_id'),field('call-id'),field('from_tag'),field('state')
        if hid.isdigit() and cid and tag and state=='4':
            key=hashlib.md5(cid.encode()).hexdigest()+hashlib.md5(tag.encode()).hexdigest()
            result.append((key,entry,hid))
    return result
def check(keys):
    cfg=open('/etc/kamailio/kamailio.cfg').read()
    token=re.search(r'http_client_query\("http://127\.0\.0\.1:18080/api/switch/kamailio/auth".*?Bearer\s+([a-f0-9]{64})',cfg,re.S)
    if not token:raise RuntimeError('Bridge token unavailable')
    req=urllib.request.Request('http://127.0.0.1:18080/api/switch/kamailio/location-check',data=json.dumps({'callKeys':keys}).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+token.group(1)})
    with urllib.request.urlopen(req,timeout=5) as response:return json.load(response)['results']
def main():
    known={}
    while True:
        try:
            active={key:(entry,hid) for key,entry,hid in dialogs(rpc('dlg.briefing','cFs'))}
            known={k:v for k,v in known.items() if k in active}
            keys=list(active)
            for offset in range(0,len(keys),32):
                for r in check(keys[offset:offset+32]):
                    if r['callKey'] not in active:continue
                    if r.get('restricted'):known[r['callKey']]=time.monotonic()
                    else:known.pop(r['callKey'],None)
                    if not r['allowed']:rpc('dlg.end_dlg',*active[r['callKey']]);known.pop(r['callKey'],None)
        except Exception:
            # A previously fenced call cannot continue indefinitely during API outage.
            for key,stamp in list(known.items()):
                if time.monotonic()-stamp>45:
                    try:rpc('dlg.end_dlg',*active[key]);known.pop(key,None)
                    except Exception:pass
            print('Location watchdog check unavailable; retrying',flush=True)
        time.sleep(5)
if __name__=='__main__':main()
