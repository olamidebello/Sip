#!/usr/bin/env python3
"""Private, allowlisted fleet worker. Run on the trusted Ansible controller."""
import argparse
import ipaddress
import json
import os
import pathlib
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[2]
ALLOWED = {'health', 'install', 'upgrade', 'firewall', 'operator_setup'}


def secrets_file(path):
    return dict(line.split('=', 1) for line in pathlib.Path(path).read_text().splitlines()
                if line and not line.startswith('#') and '=' in line)


def request(base, token, route, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + '/api/integrations/deployment/' + route, data=data,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


def probe(node, local_host=None):
    start = time.monotonic()
    target = node['ssh_user'] + '@' + node['host']
    cmd = ['ssh', '-p', str(node['ssh_port']), '-o', 'BatchMode=yes',
           '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', target,
           *([] if node['ssh_user']=='root' else ['sudo','-n']), 'systemctl', 'is-active', 'kamailio']
    local = local_host and node['host'] == local_host and os.geteuid() == 0
    if local:
        cmd = ['systemctl', 'is-active', 'kamailio']
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        status = ('healthy' if result.returncode == 0 and result.stdout.strip() == 'active'
                  else 'unreachable' if result.returncode == 255 else 'degraded')
        version = None
        if status == 'healthy':
            package_cmd = ['dpkg-query', '-W', '-f=${Version}', 'kamailio'] if local else ['ssh', '-p', str(node['ssh_port']), '-o', 'BatchMode=yes',
                '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', target,
                'dpkg-query', '-W', '-f=${Version}', 'kamailio']
            package = subprocess.run(package_cmd, capture_output=True, text=True, timeout=15)
            if package.returncode == 0:
                version = package.stdout.strip()[:80]
    except (subprocess.TimeoutExpired, OSError):
        status = 'unreachable'
        version = None
    latency = int((time.monotonic() - start) * 1000)
    return {'nodeId': node['id'], 'status': status, 'latencyMs': latency, 'version': version}


def operator_setup(node, local_host=None):
    """Only the fixed CI-gated prerequisite installer may run for this action."""
    host = str(ipaddress.IPv4Address(node['host']))
    import re
    if not re.fullmatch(r'[a-z_][a-z0-9_-]{0,31}', node['ssh_user']):
        raise ValueError('Invalid SSH user')
    port = int(node['ssh_port'])
    if not 1 <= port <= 65535:
        raise ValueError('Invalid SSH port')
    command = ['bash', '/opt/olamide/repo/deployment/install-operator-requirements.sh']
    if local_host and host == local_host and os.geteuid() == 0:
        argv = command
    else:
        argv = ['ssh', '-p', str(port), '-o', 'BatchMode=yes',
                '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8',
                node['ssh_user'] + '@' + host,
                *([] if node['ssh_user'] == 'root' else ['sudo', '-n']), *command]
    # Keep raw installation output private; never send it back through the GUI.
    log_dir = pathlib.Path('/var/log/olamide') if os.geteuid() == 0 else pathlib.Path.home() / '.local/state/olamide'
    log_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.NamedTemporaryFile(prefix='operator-', suffix='.log', dir=log_dir, delete=False) as log:
        result = subprocess.run(argv, stdout=log, stderr=log, timeout=3600)
    if result.returncode:
        raise RuntimeError('Operator prerequisites failed; inspect the private controller log. CI validation or private configuration may be missing.')


def deploy(node, inventory, vault_password):
    # Legacy fleet jobs cannot apply an unreviewed profile.
    raise RuntimeError('Use the Kamailio services capability plan and private profile controller')

def run_once(base, token, runner_id, inventory, vault_password, local_host=None):
    for node in request(base, token, 'nodes')['nodes']:
        try:
            request(base, token, 'check', probe(node, local_host))
        except (urllib.error.URLError, OSError, ValueError) as error:
            print('Health report failed for ' + node['name'] + ': ' + type(error).__name__, flush=True)
    claimed = request(base, token, 'claim', {'runnerId': runner_id}).get('job')
    if not claimed:
        return
    if claimed['action'] not in ALLOWED:
        raise RuntimeError('Unknown job action')
    done = threading.Event()
    lease_failed = threading.Event()

    def renew():
        while not done.wait(60):
            try:
                request(base, token, 'lease', {'runnerId': runner_id, 'jobId': claimed['id']})
            except (urllib.error.URLError, ValueError):
                lease_failed.set()
                return
    renewer = threading.Thread(target=renew, daemon=True)
    renewer.start()
    try:
        if claimed['action'] == 'health':
            check = probe(claimed, local_host)
            request(base, token, 'check', check)
            if check['status'] != 'healthy':
                raise RuntimeError('Switch health probe: ' + check['status'])
        elif claimed['action'] == 'operator_setup':
            operator_setup(claimed, local_host)
        else:
            deploy(claimed, inventory, vault_password)
            check = probe(claimed, local_host)
            request(base, token, 'check', check)
            if check['status'] != 'healthy':
                raise RuntimeError('Switch did not pass post-deployment health probe')
        result = ('succeeded', 'Supported Operator prerequisites installed. Missing backend features and provider authentication still require implementation or configuration.' if claimed['action'] == 'operator_setup' else 'Approved ' + claimed['action'] + ' job completed; switch active')
    except (OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError,
            RuntimeError, KeyError, IndexError, ValueError, urllib.error.URLError) as error:
        result = ('failed', str(error)[:900])
    finally:
        done.set()
        renewer.join(timeout=2)
    if lease_failed.is_set():
        print('Runner lease renewal failed; result may be rejected', flush=True)
    request(base, token, 'result', {'runnerId': runner_id, 'jobId': claimed['id'],
                                     'status': result[0], 'summary': result[1]})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--secrets', default=str(ROOT / 'deployment/secrets.env'))
    parser.add_argument('--inventory', default=str(ROOT / 'deploy/ansible/inventory.yml'))
    parser.add_argument('--vault-password-file', default='')
    parser.add_argument('--local-host', help='Private configuration: IPv4 of this application server')
    args = parser.parse_args()
    cfg = secrets_file(args.secrets)
    token = cfg.get('DEPLOY_RUNNER_TOKEN', '')
    if len(token) < 32:
        raise SystemExit('DEPLOY_RUNNER_TOKEN must have at least 32 characters')
    domain = cfg['DOMAIN']
    if not domain or '/' in domain or ':' in domain:
        raise SystemExit('Invalid DOMAIN')
    runner_id = ('runner-' + socket.gethostname().lower().replace('_', '-'))[:39]
    run_once('https://' + domain, token, runner_id, args.inventory, args.vault_password_file, args.local_host)


if __name__ == '__main__':
    main()
