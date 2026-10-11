#!/usr/bin/env python3
"""Read-only audit; no configuration values or subprocess logs leave the host."""
import argparse, datetime, hashlib, json, pathlib, re, socket, subprocess

def run(argv):
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=30)
        return p.returncode == 0, p.stdout
    except (OSError, subprocess.TimeoutExpired):
        return False, ''

def fingerprint(root):
    h = hashlib.sha256()
    if root.exists():
        for p in sorted(root.rglob('*')):
            if p.is_file() and not p.is_symlink():
                h.update(str(p.relative_to(root)).encode()); h.update(p.read_bytes())
    return h.hexdigest()

def evaluate(modules, loaded, installed, active, valid, receipts, host, digest, now):
    features = []
    for m in modules:
        name = m['id']; r = receipts.get(name, {})
        try:
            age = (now - datetime.datetime.fromisoformat(r['checkedAt'].replace('Z', '+00:00'))).total_seconds()
            bound = 0 <= age <= 86400 and r.get('host') == host and r.get('configHash') == digest and bool(r.get('testId'))
        except (KeyError, ValueError, TypeError):
            bound = False
        configured = name in loaded and name in installed and active and valid
        connected = configured and bound and r.get('connectionPassed') is True
        tested = connected and r.get('acceptancePassed') is True
        features.append({'id': name, 'installed': name in installed, 'runtimeLoaded': name in loaded and active,
                         'status': 'tested' if tested else 'connected' if connected else 'configured' if configured else 'pending',
                         'testId': str(r.get('testId', ''))[:100] if bound else ''})
    return features

def code_findings(root):
    found = []
    for p in root.rglob('*'):
        if any(x in {'.git','node_modules','dist','legacy','audit-reports','__pycache__'} for x in p.relative_to(root).parts):
            continue
        if not p.is_file() or p.is_symlink() or p.suffix not in {'.js','.yml','.sh','.md','.j2'}:
            continue
        for line, text in enumerate(p.read_text(errors='replace').splitlines(), 1):
            if re.search(r'\b(freeswitch|fs_cli|sofia)\b', text, re.I):
                found.append({'path': str(p.relative_to(root)), 'line': line})
    return found[:500]

def main():
    a = argparse.ArgumentParser()
    for name in ['catalog','output','repo','node-id']: a.add_argument('--'+name, required=True)
    a.add_argument('--config', default='/etc/kamailio/kamailio.cfg')
    a.add_argument('--receipts', default='/var/lib/olamide/kamailio-acceptance.json')
    args = a.parse_args()
    modules = json.loads(pathlib.Path(args.catalog).read_text())['modules']
    active, _ = run(['systemctl','is-active','--quiet','kamailio'])
    valid, _ = run(['kamailio','-c','-f',args.config])
    rpc_ok, runtime = run(['kamcmd','core.modules'])
    loaded = {m['id'] for m in modules if re.search(r'(?<!\w)'+re.escape(m['id'])+r'(?:\.so)?(?!\w)', runtime.lower())} if rpc_ok else set()
    installed = set()
    for root in [pathlib.Path('/usr/lib'),pathlib.Path('/usr/local/lib'),pathlib.Path('/usr/lib64'),pathlib.Path('/usr/local/lib64')]:
        if root.exists():
            installed.update(p.stem.lower() for p in root.glob('**/kamailio/modules/*.so'))
    config = pathlib.Path(args.config); digest = fingerprint(config.parent)
    receipt_path = pathlib.Path(args.receipts)
    receipts = json.loads(receipt_path.read_text()) if receipt_path.exists() else {}
    now = datetime.datetime.now(datetime.timezone.utc); host = socket.gethostname()
    report = {'schemaVersion':1,'nodeId':args.node_id,'host':host,'checkedAt':now.isoformat(),
              'configHash':digest,'serviceActive':active,'configValid':valid,'rpcReachable':rpc_ok,
              'features':evaluate(modules,loaded,installed,active,valid,receipts,host,digest,now),
              'codeFindings':code_findings(pathlib.Path(args.repo))}
    out = pathlib.Path(args.output); out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2)+'\n'); out.chmod(0o600)

if __name__ == '__main__': main()
