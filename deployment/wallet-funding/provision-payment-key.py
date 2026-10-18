#!/usr/bin/env python3
"""Preserve the active payment encryption key, or initialize an unused installation."""
import os
import json
from pathlib import Path
import re
import secrets
import subprocess

paths = [Path('/etc/olamide/secrets.env'), Path('/opt/olamide/repo/deployment/docker/.env')]
result = subprocess.run(['docker', 'inspect', 'docker-api-1', '--format', '{{json .Config.Env}}'],
                        capture_output=True, text=True)
if result.returncode:
    raise SystemExit('Could not inspect saved API configuration; existing keys preserved')
try:
    environment = json.loads(result.stdout)
    if not isinstance(environment, list) or not all(isinstance(v, str) for v in environment):
        raise ValueError('Invalid environment')
    active_values = [v.split('=', 1)[1] for v in environment if v.startswith('PAYMENT_CONFIG_KEY=')]
    if len(active_values) > 1:
        raise ValueError('Duplicate saved key')
    active = active_values[0].strip() if active_values else ''
except (ValueError, TypeError):
    raise SystemExit('Invalid saved API configuration; existing keys preserved')
contents = {}
candidates = set()
if active:
    candidates.add(active)
for path in paths:
    if path.is_symlink():
        raise SystemExit('Refusing a symlink environment file')
    text = path.read_text() if path.exists() else ''
    contents[path] = text
    values = re.findall(r'^PAYMENT_CONFIG_KEY=(.*)$', text, re.M)
    if len(values) > 1:
        raise SystemExit('Duplicate payment encryption keys; reconcile private environment first')
    for value in values:
        value = value.strip().strip('\"\'')
        if value:
            candidates.add(value)
if len(candidates) > 1 or any(not re.fullmatch(r'[a-fA-F0-9]{64}', v) for v in candidates):
    raise SystemExit('Conflicting or invalid payment encryption keys; existing configuration preserved')
if not candidates:
    script = """import {createDatabase} from './db.js';
const p=createDatabase(process.env.MYSQL_URL);
try {for(const table of ['payment_gateways','store_gateways']) {
 const found=await p.query('SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=$1',[table]);
 if(found.rowCount && Number((await p.query('SELECT COUNT(*) AS n FROM '+table)).rows[0].n)>0) process.exitCode=2;
}} finally {await p.end();}
"""
    check = subprocess.run(['docker', 'exec', '-i', '-w', '/app', 'docker-api-1', 'node', '--input-type=module'],
                           input=script, text=True, capture_output=True)
    if check.returncode:
        raise SystemExit('Existing encrypted gateways or database unavailable; restore original payment key first')
key = next(iter(candidates)) if candidates else secrets.token_hex(32)
for path, text in contents.items():
    line = 'PAYMENT_CONFIG_KEY=' + key
    if re.search(r'^PAYMENT_CONFIG_KEY=.*$', text, re.M):
        updated = re.sub(r'^PAYMENT_CONFIG_KEY=.*$', lambda _: line, text, flags=re.M)
    else:
        updated = text + ('' if not text or text.endswith('\n') else '\n') + line + '\n'
    if updated != text:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = path.with_name(path.name + '.wallet-key-tmp')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, 'w') as stream:
                stream.write(updated)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
print('Payment encryption key preserved and synchronized; no credential values displayed.')
