import unittest
from install_number_porting import patched_server, patched_ui

class InstallerTest(unittest.TestCase):
    def test_integration_is_additive_and_idempotent(self):
        s='''const unrelatedProductionSetting=true;
      if (!user) return send(res, 401, { error: "Sign in required" });
await migrate(pool);
server.listen(port, address, () => console.log('ready'));
'''
        p=patched_server(s)
        self.assertEqual(patched_server(p), p)
        self.assertIn('const unrelatedProductionSetting=true;',p)
        self.assertIn('migrateNumberPorting(pool)',p)
        ui='  $("#signed-in-profile").hidden=false;\n'
        self.assertEqual(patched_ui(patched_ui(ui)),patched_ui(ui))

    def test_incompatible_source_fails_before_changes(self):
        with self.assertRaises(ValueError):
            patched_server('unknown source')
        with self.assertRaises(ValueError):
            patched_ui('unknown source')

if __name__=='__main__':
    unittest.main()
