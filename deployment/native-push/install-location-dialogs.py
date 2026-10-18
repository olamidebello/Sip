#!/usr/bin/env python3
"""Add dialog tracking to the existing authenticated internal-call route."""
from pathlib import Path
import datetime,os,subprocess,tempfile,sys
def main():
    path=Path('/etc/kamailio/kamailio.cfg');old=path.read_text()
    if '# OLAMIDE_LOCATION_DIALOG_V2' in old:
        print('unchanged');return
    start=old.find('request_route {');end=old.find('route[LOOKUP_HA1]',start)
    if start<0 or end<0:raise SystemExit('Expected authenticated routing layout unavailable; no changes made')
    block=old[start:end]
    if 'route(OLAMIDE_PAID_CALL)' not in block or block.count('record_route();')!=1:raise SystemExit('Internal routing anchor is ambiguous; no changes made')
    block=block.replace('record_route();','record_route();\n    # OLAMIDE_LOCATION_DIALOG_V2\n    $dlg_ctx(timeout_bye)=1;\n    dlg_manage();',1)
    candidate=old[:start]+block+old[end:]
    hook='http_client_query("http://127.0.0.1:18080/api/switch/kamailio/route"'
    if candidate.count(hook)!=1:raise SystemExit('Location proof forwarding anchor unavailable; no changes made')
    forward='$var(location_proof)="";\n    if($hdr(X-Olamide-Location-Proof) =~ "^[a-f0-9]{64}$") $var(location_proof)=$hdr(X-Olamide-Location-Proof);\n    if(!jansson_set("string","locationProof","$var(location_proof)","$var(req)")){sl_send_reply("503","Location proof unavailable");exit;}\n    '
    candidate=candidate.replace(hook,forward+hook,1)
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,prefix='location-candidate-',delete=False) as f:
        f.write(candidate);temp=Path(f.name)
    try:
        subprocess.run(['kamailio','-c','-f',str(temp)],check=True,capture_output=True)
        if '--check' in sys.argv:
            print('validated: authenticated dialog tracking candidate');return
        stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S')
        backup=Path(str(path)+'.before-location-'+stamp);backup.write_bytes(path.read_bytes());backup.chmod(0o600)
        meta=path.stat();os.chmod(temp,meta.st_mode&0o777);os.chown(temp,meta.st_uid,meta.st_gid);temp.replace(path)
    finally:temp.unlink(missing_ok=True)
    print('changed: location dialog tracking validated and installed')
if __name__=='__main__':main()
