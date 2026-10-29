import ast,json,subprocess,tempfile,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
HELPER=ROOT/'tools/apply_sms_navigation.py'

class SmsPatchTests(unittest.TestCase):
 def test_older_policy_preserves_restrictions_and_repeated_install(self):
  for defaults in ["['money','social']", "['money','social','outbound-rates']", None]:
   with self.subTest(defaults=defaults),tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp)
    for name in ['apps/web/src/main.js','apps/web/src/userNavigation.js','services/api/navigationPolicy.js']:
     p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text((ROOT/name).read_text())
    p=root/'services/api/navigationPolicy.js';s=p.read_text()
    current="['money','social','outbound-rates','external-sms'].includes(key)"
    s=s.replace('||'+current,'' if defaults is None else '||'+defaults+'.includes(key)');p.write_text(s)
    for _ in range(2):subprocess.run(['python3',str(HELPER),tmp],check=True,capture_output=True)
    module=root/'policy.mjs';module.write_text(p.read_text())
    code="import {resolveNavigation as r} from './policy.mjs';import assert from 'node:assert/strict';assert.equal(r()['external-sms'],true);assert.equal(r([{'external-sms':false}])['external-sms'],false);assert.equal(r([] ,{'external-sms':false})['external-sms'],false);assert.equal(r([{money:false}]).money,false);"
    subprocess.run(['node','--input-type=module','-e',code],cwd=tmp,check=True,capture_output=True)
 def test_unknown_policy_stops_before_writing(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   for name in ['apps/web/src/main.js','apps/web/src/userNavigation.js','services/api/navigationPolicy.js']:
    p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text((ROOT/name).read_text() if 'navigationPolicy' not in name else '// Unknown policy')
   p=root/'apps/web/src/main.js';before=p.read_bytes()
   run=subprocess.run(['python3',str(HELPER),tmp],capture_output=True,text=True)
   self.assertNotEqual(run.returncode,0);self.assertIn('step=5',run.stderr);self.assertEqual(p.read_bytes(),before)

if __name__=='__main__':unittest.main()
