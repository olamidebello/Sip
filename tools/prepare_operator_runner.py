#!/usr/bin/env python3
"""Bootstrap private worker configuration without printing credentials."""
import os
from pathlib import Path
import secrets
import shlex
import socket
import ipaddress
from urllib.parse import urlsplit


def prepare(directory=Path('/etc/olamide')):
    path = directory / 'secrets.env'
    # Refuse symlinks and non-root ownership for the privileged configuration.
    info = path.lstat()
    if path.is_symlink() or info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('Private root-owned secrets.env with mode 0600 required')
    text = path.read_text()
    values = {}
    for line in text.splitlines():
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            parsed = shlex.split(value)
            values[key] = parsed[0] if parsed else ''
    domain = values.get('DOMAIN') or urlsplit(values.get('PUBLIC_ORIGIN', '')).hostname
    if not domain or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-' for c in domain):
        raise ValueError('Valid DOMAIN or PUBLIC_ORIGIN required')
    # Explicit private override supports NAT; never take the local binding from a GUI job.
    host = str(ipaddress.IPv4Address(values.get('OPERATOR_LOCAL_HOST') or socket.gethostbyname(domain)))
    token = values.get('DEPLOY_RUNNER_TOKEN', '')
    changed = not token
    if not token:
        token = secrets.token_hex(32)
        lines = [line for line in text.splitlines() if not line.startswith('DEPLOY_RUNNER_TOKEN=')]
        lines.append('DEPLOY_RUNNER_TOKEN=' + token)
        temporary = directory / '.operator-secrets.tmp'
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write('\n'.join(lines) + '\n')
        os.replace(temporary, path)
    if len(token) < 32 or not all(c.isalnum() or c in '_-.' for c in token):
        raise ValueError('Runner token must have at least 32 safe characters')
    for name, content in [('operator-runner.conf', 'DOMAIN=' + domain + '\nDEPLOY_RUNNER_TOKEN=' + token + '\n'),
                          ('operator-runner.env', 'OPERATOR_LOCAL_HOST=' + host + '\n')]:
        target = directory / name
        if target.is_symlink():
            raise ValueError('Runner configuration must not be a symlink')
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
        target.chmod(0o600)
    print('changed' if changed else 'ready')


if __name__ == '__main__':
    prepare()
