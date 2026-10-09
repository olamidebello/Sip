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
ALLOWED = {'health', 'install', 'upgrade', 'firewall', 'kamailio_test'}


def secrets_file(path):
    return dict(line.split('=', 1) for line in pathlib.Path(path).read_text().splitlines()
                if line and not line.startswith('#') and '=' in line)


def request(base, token, route, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + '/api/integrations/deployment/' + route, data=data,
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)


def probe(node):
    start = time.monotonic()
    target = node['ssh_user'] + '@' + node['host']
    cmd = ['ssh', '-p', str(node['ssh_port']), '-o', 'BatchMode=yes',
           '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', target,
           'sudo', '-n', 'systemctl', 'is-active', 'freeswitch']
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        status = ('healthy' if result.returncode == 0 and result.stdout.strip() == 'active'
                  else 'unreachable' if result.returncode == 255 else 'degraded')
        version = None
        if status == 'healthy':
            package = subprocess.run(['ssh', '-p', str(node['ssh_port']), '-o', 'BatchMode=yes',
                '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', target,
                'dpkg-query', '-W', '-f=\\${Version}', 'freeswitch'], capture_output=True,
                text=True, timeout=15)
            if package.returncode == 0:
                version = package.stdout.strip()[:80]
    except (subprocess.TimeoutExpired, OSError):
        status = 'unreachable'
        version = None
    latency = int((time.monotonic() - start) * 1000)
    return {'nodeId': node['id'], 'status': status, 'latencyMs': latency, 'version': version}



def probe_kamailio(node):
    start = time.monotonic()
    target = node['ssh_user'] + '@' + node['host']
    ssh = ['ssh', '-p', str(node['ssh_port']), '-o', 'BatchMode=yes',
           '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8', target]
    try:
        signal = subprocess.run(ssh + ['sudo', '-n', 'systemctl', 'is-active', 'kamailio'],
                                capture_output=True, text=True, timeout=15)
        media = subprocess.run(ssh + ['sudo', '-n', 'systemctl', 'is-active', 'rtpengine-daemon'],
                               capture_output=True, text=True, timeout=15)
        version = subprocess.run(ssh + ['dpkg-query', '-W', '-f=\\${Version}', 'kamailio'],
                                 capture_output=True, text=True, timeout=15)
        signaling_status = ('unreachable' if signal.returncode == 255 else
                            'active' if signal.returncode == 0 and signal.stdout.strip() == 'active'
                            else 'inactive')
        media_status = ('unreachable' if media.returncode == 255 else
                        'active' if media.returncode == 0 and media.stdout.strip() == 'active'
                        else 'inactive')
        installed_version = version.stdout.strip()[:80] if version.returncode == 0 else None
    except (subprocess.TimeoutExpired, OSError):
        signaling_status = media_status = 'unreachable'
        installed_version = None
    return {'nodeId': node['id'], 'signalingStatus': signaling_status,
            'mediaStatus': media_status, 'version': installed_version,
            'latencyMs': int((time.monotonic() - start) * 1000)}


def deploy(node, inventory, vault_password):
    # Inherit reviewed group variables, replacing only the selected target host.
    source = json.loads(pathlib.Path(inventory).read_text())
    group = source['all']['children']['switch_nodes']
    vars_ = group['vars']
    hosts = group['hosts']
    local_hosts = {str(host.get('ansible_host')) for host in hosts.values()}
    if node['host'] not in local_hosts and vars_.get('freeswitch_wss_certificate_source') == 'caddy':
        raise RuntimeError('Remote switch requires controller certificate/key configuration in the private inventory')
    firewall = node.get('firewallPolicy') if node['action'] == 'firewall' else None
    if node['action'] == 'firewall':
        if not firewall or not firewall['enabled']:
            raise RuntimeError('Firewall policy is unavailable or disabled')
        if vars_.get('freeswitch_wss_certificate_source') == 'caddy':
            raise RuntimeError('Co-located Caddy and Docker host firewall is managed outside this runner')
        cidrs = firewall['ssh_cidrs']
        peers = firewall['carrier_cidrs']
        if isinstance(cidrs, str):
            cidrs = json.loads(cidrs)
        if isinstance(peers, str):
            peers = json.loads(peers)
        source = subprocess.run(['ssh', '-p', str(node['ssh_port']), '-o', 'BatchMode=yes',
            '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8',
            node['ssh_user'] + '@' + node['host'], 'printf', '%s', '"$SSH_CONNECTION"'],
            capture_output=True, text=True, timeout=15, check=True).stdout.split()[0]
        if not any(ipaddress.ip_address(source) in ipaddress.ip_network(cidr, strict=False) for cidr in cidrs):
            raise RuntimeError('Controller SSH source is outside the policy SSH allowlist')
        vars_['manage_firewall'] = True
        vars_['freeswitch_ssh_allowed_cidrs'] = cidrs
        vars_['freeswitch_carrier_allowed_cidrs'] = peers
    group['hosts'] = {'fleet-target': {'ansible_host': node['host'], 'ansible_user': node['ssh_user'],
                                      'ansible_port': node['ssh_port']}}
    with tempfile.TemporaryDirectory(prefix='olamide-fleet-') as tmp:
        path = pathlib.Path(tmp) / 'inventory.json'
        path.write_text(json.dumps(source))
        playbook = 'firewall.yml' if node['action'] == 'firewall' else 'site.yml'
        cmd = ['ansible-playbook', '-i', str(path), str(ROOT / 'deploy/ansible' / playbook),
               '--vault-password-file', vault_password]
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=3600)
        # Do not persist Ansible output: tasks could print private configuration.
        if result.returncode:
            raise RuntimeError('Ansible exited with code ' + str(result.returncode) + '; inspect the private controller journal')


def run_once(base, token, runner_id, inventory, vault_password):
    for node in request(base, token, 'nodes')['nodes']:
        try:
            request(base, token, 'check', probe(node))
            request(base, token, 'kamailio-check', probe_kamailio(node))
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
        if claimed['action'] == 'kamailio_test':
            target = claimed['ssh_user'] + '@' + claimed['host']
            cmd = ['ssh', '-p', str(claimed['ssh_port']), '-o', 'BatchMode=yes',
                   '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=8',
                   target, 'sudo', '-n', 'python3',
                   '/opt/olamide/kamailio-staging/deploy/kamailio/sip-smoke.py']
            smoke = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
            request(base, token, 'kamailio-check', probe_kamailio(claimed))
            if smoke.returncode or 'Loopback SIP:' not in smoke.stdout:
                raise RuntimeError('Kamailio loopback SIP test failed; inspect private runner journal')
        elif claimed['action'] == 'health':
            check = probe(claimed)
            request(base, token, 'check', check)
            if check['status'] != 'healthy':
                raise RuntimeError('Switch health probe: ' + check['status'])
        else:
            deploy(claimed, inventory, vault_password)
            check = probe(claimed)
            request(base, token, 'check', check)
            if check['status'] != 'healthy':
                raise RuntimeError('Switch did not pass post-deployment health probe')
        result = ('succeeded', 'Kamailio loopback SIP challenge passed' if
                  claimed['action'] == 'kamailio_test' else
                  'Approved ' + claimed['action'] + ' job completed; switch active')
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
    parser.add_argument('--vault-password-file', required=True)
    args = parser.parse_args()
    cfg = secrets_file(args.secrets)
    token = cfg.get('DEPLOY_RUNNER_TOKEN', '')
    if len(token) < 32:
        raise SystemExit('DEPLOY_RUNNER_TOKEN must have at least 32 characters')
    domain = cfg['DOMAIN']
    if not domain or '/' in domain or ':' in domain:
        raise SystemExit('Invalid DOMAIN')
    runner_id = ('runner-' + socket.gethostname().lower().replace('_', '-'))[:39]
    run_once('https://' + domain, token, runner_id, args.inventory, args.vault_password_file)


if __name__ == '__main__':
    main()
