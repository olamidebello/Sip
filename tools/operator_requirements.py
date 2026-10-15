#!/usr/bin/env python3
"""Validate every Operator feature has matching frontend/backend metadata."""
import json
from pathlib import Path


def coverage(root):
    backend = json.loads((root / 'services/api/telecomFeatureCatalog.json').read_text())
    frontend = json.loads((root / 'apps/web/src/advancedTelecomCatalog.json').read_text())
    assert backend == frontend, 'Frontend and backend Operator catalogs differ'
    assert len({row['id'] for row in backend}) == len(backend), 'Duplicate feature IDs'
    states = {'implemented', 'partial', 'not_implemented', 'external_dependency'}
    assert all(row['implementation'] in states for row in backend)
    return {'features': len(backend), 'fullyOperational': False,
            'gui': 'Operator feature → Install Operator server requirements → select server → Install Operator requirements',
            'supportedPackages': ['ansible-core', 'python3', 'git', 'curl', 'jq', 'openssl', 'ca-certificates', 'openssh-client'],
            'remaining': [{'name': row['name'], 'status': row['implementation'],
                           'requirement': row['detail']} for row in backend if row['implementation'] != 'implemented'],
            'scope': 'Prerequisites only. Missing application code, provider accounts, licensed data, native console integration and live acceptance tests are separate requirements.'}


if __name__ == '__main__':
    print(json.dumps(coverage(Path(__file__).resolve().parents[1])))
