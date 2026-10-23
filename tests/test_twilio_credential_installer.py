import ast
import os
from pathlib import Path
import unittest

installer=Path(os.environ.get('TWILIO_CREDENTIAL_INSTALLER',Path(__file__).resolve().parents[1]/'tools/install-twilio-credentials.py'))
tree=ast.parse(installer.read_text())
namespace={}
exec(compile(ast.Module(body=[node for node in tree.body if isinstance(node,ast.FunctionDef)],type_ignores=[]),str(installer),'exec'),namespace)
integrate=namespace['ui']

def source(cleanup):
 return 'export function setup(){admin.append(box);billing.append(portal);return {dispose(){'+cleanup+'}};}'

class InstallerTests(unittest.TestCase):
 def test_original_hub_cleanup(self):
  result=integrate(source('providerRoles?.dispose();box.remove();portal.remove();style.remove();'))
  self.assertEqual(result.count('credentialControls.dispose();'),1)
  self.assertIn('providerRoles?.dispose();credentialControls.dispose();box.remove();',result)
 def test_readiness_cleanup_is_preserved(self):
  result=integrate(source('providerRoles?.dispose();readiness?.dispose();box.remove();portal.remove();style.remove();'))
  self.assertIn('providerRoles?.dispose();credentialControls.dispose();readiness?.dispose();box.remove();',result)
 def test_other_installed_disposers_and_spacing_survive(self):
  result=integrate(source('providerRoles?.dispose();\n readiness?.dispose();\n otherPanel.dispose();box.remove();'))
  self.assertIn('readiness?.dispose();\n otherPanel.dispose();',result)
 def test_repeated_install_is_identical(self):
  result=integrate(source('providerRoles?.dispose();readiness?.dispose();box.remove();'))
  self.assertEqual(integrate(result),result)
 def test_unknown_core_cleanup_still_stops(self):
  with self.assertRaises(SystemExit):integrate(source('unknownCleanup();'))

if __name__=='__main__':unittest.main()
