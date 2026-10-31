import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class MarketplaceInstallerTests(unittest.TestCase):
    def test_preserves_deployed_integrations_and_repeats_safely(self):
        markers = {
            'services/api/server.js': 'SMOOTHDID_SERVER_V1',
            'services/api/dids.js': 'SMOOTHDID_LEGACY_V1',
            'services/api/locationPolicy.js': 'SMOOTHDID_LOCATION_V1',
            'services/api/pstnBilling.js': 'SMOOTHDID_CALL_V1',
            'services/api/subscriberRouting.js': 'SMOOTHDID_SUBSCRIBER_V1',
            'services/api/inboundRouting.js': 'SMOOTHDID_INBOUND_V1',
            'apps/web/src/main.js': 'SMOOTHDID_UI_V1',
        }
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            for name, marker in markers.items():
                p = root / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text('// ' + marker + '\n// Existing server customization\n')
            for _ in range(2):
                subprocess.run([sys.executable, str(ROOT / 'tools/install_inhouse_marketplace.py'), td], check=True)
            for name, marker in markers.items():
                self.assertEqual((root/name).read_text(), '// '+marker+'\n// Existing server customization\n')
            for name in ['services/api/smoothDid.js', 'services/api/inhouseSubscriber.js', 'apps/web/src/smoothDidUi.js']:
                self.assertEqual((root/name).read_bytes(), (ROOT/name).read_bytes())

    def test_future_included_deployments_remove_the_old_purchase_blocker(self):
        spec = importlib.util.spec_from_file_location('included_installer', ROOT/'tools/install_inhouse_subscribers.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        old = " // INHOUSE_SUBSCRIBER_NO_RENTAL_V1\n if(await subscriberActive(pool,user.tenant_id,user.id))throw Error('Your subscriber in-house DID is included free. Use your assigned number; no rental purchase is required.');"
        self.assertEqual(module.patch_smooth('before'+old+'after'), 'beforeafter')
        self.assertEqual(module.patch_smooth('unchanged'), 'unchanged')

if __name__ == '__main__':
    unittest.main()
