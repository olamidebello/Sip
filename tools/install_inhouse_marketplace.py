"""Integrate the existing wallet-backed marketplace without resetting host config."""
from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
controller = Path(__file__).resolve().parents[1]
subprocess.run([sys.executable, str(controller / 'tools/install-smoothdid.py'), str(root)], check=True)
for name in ['services/api/didAvailability.js', 'services/api/smoothDid.js', 'services/api/inhouseSubscriber.js', 'apps/web/src/smoothDidUi.js']:
    target = root / name
    if target.is_symlink():
        raise ValueError('Marketplace target must not be a symlink')
    target.write_bytes((controller / name).read_bytes())
print('In-house DID marketplace integrated. Existing group pricing and service areas preserved.')
