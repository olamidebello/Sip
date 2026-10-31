from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]

class CallingPlanInstallerTests(unittest.TestCase):
    def test_install_preserves_original_customizations_and_is_idempotent(self):
        paths=['services/api/server.js','services/api/wallet.js','services/api/walletPurchases.js','apps/web/src/main.js']
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            for name in paths:
                source=subprocess.check_output(['git','show','62d7292b65ef064a58eba6aca1336a00d6c62399:'+name],cwd=ROOT,text=True)
                target=root/name
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_text(source+'\n// Host customization retained\n')
            command=[sys.executable,str(ROOT/'tools/install_calling_plan_builder.py'),td]
            subprocess.run(command,check=True)
            before={name:(root/name).read_text() for name in paths}
            subprocess.run(command,check=True)
            for name in paths:
                self.assertEqual((root/name).read_text(),before[name])
                self.assertIn('// Host customization retained',before[name])
                subprocess.run(['node','--check',str(root/name)],check=True)
            main=before['apps/web/src/main.js']
            self.assertGreater(main.index('setupCallingPlanBuilder({'),main.index('let recentCalls = [],softphoneUserId=null'))
            server=before['services/api/server.js']
            self.assertGreater(server.index("if(path.startsWith('/api/billing/calling-plans'))"),server.index('const user = await currentUser(req);',server.index('path===\"/api/activity/events\"')))

    def test_unknown_layout_stops_before_any_files_are_changed(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            for name in ['services/api/server.js','services/api/wallet.js','services/api/walletPurchases.js','apps/web/src/main.js']:
                p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('// unknown host source\n')
            result=subprocess.run([sys.executable,str(ROOT/'tools/install_calling_plan_builder.py'),td],capture_output=True)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual((root/'services/api/server.js').read_text(),'// unknown host source\n')

if __name__=='__main__':unittest.main()
