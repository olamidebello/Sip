import unittest
from tools.audit_application_modules import inventory

class ModuleAuditTests(unittest.TestCase):
 def test_discovery_lists_are_canonical_and_explicit_about_runtime(self):
  result=inventory()
  modules=result['apiModules']
  self.assertEqual([m['source'] for m in modules],sorted(m['source'] for m in modules))
  for module in modules:
   self.assertEqual(module['tests'],sorted(module['tests']))
   self.assertEqual(module['guiReferences'],sorted(module['guiReferences']))
   self.assertEqual(module['liveAcceptance'],'unverified')
  self.assertEqual(len(result['kamailioModules']),266)
  self.assertEqual(len(result['features']),len({f['id'] for f in result['features']}))
  self.assertIn('cdr_archives',result['schemaComponents'])
  self.assertIn('payment_reconciliation',result['schemaComponents'])

if __name__=='__main__':unittest.main()
