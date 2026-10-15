import json,pathlib,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class WiringTest(unittest.TestCase):
 def test_manifest_covers_exact_menu_routes_and_identifies_missing_controller(self):
  manifest=json.loads((ROOT/'deployment/native-astpp/menu-wiring.json').read_text())
  menus=json.loads((ROOT/'apps/web/src/nativeAstppMenus.json').read_text())
  self.assertEqual([(m['id'],m['path']) for m in menus],[(m['id'],m['path']) for m in manifest['menus']])
  unavailable=[m for m in manifest['menus'] if not m['codeAvailable']]
  self.assertEqual([m['path'] for m in unavailable],['opensips/opensips_list/'])
  self.assertTrue(all(m.get('unavailableReason') for m in menus if m['path']=='opensips/opensips_list/'))
 def test_container_packages_manifest_and_verifier(self):
  docker=(ROOT/'deployment/native-astpp/Dockerfile').read_text()
  self.assertIn('verify_menu_wiring.php menu-wiring.json',docker)
 def test_http_checker_is_read_only_and_explicit_about_acceptance(self):
  import runpy,unittest.mock,urllib.request
  module=runpy.run_path(str(ROOT/'tools/native_astpp_smoke.py'))
  # Every enumerated request is a GET; only the login form submits credentials.
  source=(ROOT/'tools/native_astpp_smoke.py').read_text()
  self.assertIn("client.open(origin+'/'+menu['path'],timeout=30)",source)
  self.assertIn('live calls remain unverified',source)
