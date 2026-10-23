from pathlib import Path
import subprocess
import tempfile
import unittest
import os

INSTALLER=Path(os.environ.get('TWILIO_DID_INSTALLER',Path(__file__).resolve().parents[1]/'tools/install-twilio-dids.py'))
HUB="      if(path==='/api/twilio'||path.startsWith('/api/twilio/'))return await handleTwilioHub();"
SERVER=HUB+'\nawait migratePstnBilling(pool);\n'
INIT='const signupCaptcha=setupSignupCaptcha({document,get:apiGet});'
HANDLER='async function searchProviderNumbers(offset) { return offset; }'

class InstallerTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
  self.server=self.root/'services/api/server.js';self.main=self.root/'apps/web/src/main.js'
  for p in [self.server,self.main]:p.parent.mkdir(parents=True,exist_ok=True)
  self.server.write_text(SERVER)
 def install(self,body):
  self.main.write_text(INIT+'\n'+body)
  r=subprocess.run(['python3',str(INSTALLER),str(self.root)],capture_output=True,text=True)
  self.assertEqual(r.returncode,0,r.stderr);return self.main.read_text()
 def test_multiline_legacy_options_and_extra_attributes(self):
  out=self.install('const html=`<select class="shop" id="number-provider">\n<option value="didww">DIDWW</option>\n<option value="inhouse" selected>My numbers</option>\n<option value="flowroute">Flowroute</option></select>`;\n'+HANDLER)
  self.assertIn('value="twilio">TWI · Twilio',out);self.assertIn('value="inhouse" selected>SMO · SmoothDID',out);self.assertIn('twilio-did-search',out)
 def test_modern_country_shop_is_preserved_without_legacy_selector(self):
  body='const html=`<form id="country-shop"><select name="country"><option>US</option></select><button>Find available DIDs</button></form>`;'
  out=self.install(body);self.assertIn(body,out);self.assertIn('setupTwilioDidUi({document',out)
 def test_existing_twilio_option_is_not_duplicated(self):
  out=self.install('const html=`<select id="number-provider"><option value="twilio">Twilio</option></select>`;\n'+HANDLER)
  self.assertEqual(out.count('value="twilio"'),1)
 def test_selector_without_known_handler_is_not_rewired(self):
  body='const html=`<select id="number-provider"><option value="flowroute">Flowroute</option></select>`;'
  self.assertIn(body,self.install(body))
 def test_repeat_install_is_byte_identical(self):
  self.install('const html=`<section>Modern shop</section>`;');before=[p.read_bytes() for p in [self.server,self.main]]
  r=subprocess.run(['python3',str(INSTALLER),str(self.root)],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(before,[p.read_bytes() for p in [self.server,self.main]])
 def test_specific_routes_precede_generic_hub(self):
  self.install('');s=self.server.read_text();self.assertLess(s.index('return await handleTwilioDids'),s.index('return await handleTwilioHub'))
 def test_unknown_core_anchor_does_not_write_either_file(self):
  self.main.write_text('unknown application bootstrap');before=[p.read_bytes() for p in [self.server,self.main]]
  r=subprocess.run(['python3',str(INSTALLER),str(self.root)],capture_output=True,text=True);self.assertNotEqual(r.returncode,0);self.assertEqual(before,[p.read_bytes() for p in [self.server,self.main]])

if __name__=='__main__':unittest.main()
