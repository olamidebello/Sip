#!/usr/bin/env python3
"""Use saved runtime overrides for wallet deployment without printing secrets."""
import json
import os
from pathlib import Path
import subprocess
import sys


def compose_files(repo, saved=''):
    directory = repo / 'deployment/docker'
    files = [directory / 'compose.yml']
    for name in saved.split(','):
        path = Path(name.strip())
        if name.strip() and path.is_file() and path not in files:
            files.append(path)
    for path in [directory / 'compose.override.yml', directory / 'compose.override.yaml',
                 directory / 'compose.callerids.yml', Path('/etc/olamide/compose.location.yml'),
                 Path('/etc/olamide/compose.countries.yml'), Path('/etc/olamide/compose.flowroute-inbound.yml')]:
        if path.is_file() and path not in files:
            files.append(path)
    return files


def main():
    repo = Path(__file__).resolve().parents[2]
    directory = repo / 'deployment/docker'
    result = subprocess.run(['docker', 'inspect', 'docker-api-1', '--format', '{{json .Config.Labels}}'],
                            capture_output=True, text=True)
    labels = json.loads(result.stdout) if result.returncode == 0 else {}
    saved = (labels or {}).get('com.docker.compose.project.config_files', '')
    args = ['docker', 'compose', '-p', 'docker', '--project-directory', str(directory),
            '--env-file', str(directory / '.env')]
    for path in compose_files(repo, saved):
        args.extend(['-f', str(path)])
    args.extend(sys.argv[1:])
    os.chdir(directory)
    os.execvp(args[0], args)


if __name__ == '__main__':
    main()
