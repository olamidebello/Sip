import unittest,tempfile,subprocess,json,shutil,stat
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class InstallTests(unittest.TestCase):
 def test_android_install_repeats_without_duplicate_services(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)/'mobile';root.mkdir()
   for name in ['install-native-push.py','native-push.gradle']:shutil.copy(ROOT/'apps/mobile'/name,root/name)
   shutil.copytree(ROOT/'apps/mobile/push-native',root/'push-native');shutil.copytree(ROOT/'apps/mobile/carrier-native',root/'carrier-native')
   app=root/'android/app';(app/'src/main').mkdir(parents=True);(app/'src/main/AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application/></manifest>');(app/'build.gradle').write_text('dependencies {}\n')
   config=Path(tmp)/'google.json';config.write_text(json.dumps({'project_info':{'project_id':'test-project','project_number':'123'},'client':[{'client_info':{'mobilesdk_app_id':'1:123:android:fixture','android_client_info':{'package_name':'com.dobhrap.olamide'}},'api_key':[{'current_key':'test-public-key'}]}]}))
   for _ in range(2):subprocess.run(['python3',str(root/'install-native-push.py'),'--google-services',str(config)],check=True,capture_output=True)
   manifest=(app/'src/main/AndroidManifest.xml').read_text();self.assertEqual(manifest.count('com.dobhrap.olamide.OlamideMessagingService'),1);self.assertEqual(manifest.count('com.dobhrap.olamide.OlamideCallService'),1);self.assertEqual((app/'build.gradle').read_text().count('native-push.gradle'),1)
   self.assertIn('FOREGROUND_SERVICE_MICROPHONE',manifest)
 def test_private_secret_provisioning_reuses_token(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);service=root/'service.json';service.write_text(json.dumps({'type':'service_account','project_id':'fixture-project','client_email':'fixture@example.org','private_key':'-----BEGIN PRIVATE KEY-----fixture'}));env=root/'secrets.env';env.write_text('DOMAIN=sip.example.org\n')
   cmd=['python3',str(ROOT/'deployment/native-push/provision-secrets.py'),'--service-account',str(service),'--env',str(env)]
   subprocess.run(cmd,check=True,capture_output=True);first=env.read_text();subprocess.run(cmd,check=True,capture_output=True);self.assertEqual(first,env.read_text());self.assertEqual(stat.S_IMODE(env.stat().st_mode),0o600);self.assertEqual(len(next(l.split('=',1)[1] for l in first.splitlines() if l.startswith('NATIVE_PUSH_HOOK_TOKEN='))),64)
 def test_routing_requires_reviewed_marker_and_repeats_safely(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);main=root/'kamailio.cfg';auth=root/'olamide-auth.cfg';main.write_text('#!include_file "olamide-auth.cfg"\nrequest_route { # OLAMIDE_PUSH_LOOKUP_MISS\n}\n');auth.write_text('route[OLAMIDE_REGISTER] { if (!save("location")) sl_reply_error(); }')
   cmd=['python3',str(ROOT/'deployment/native-push/install-routing.py'),str(root)]
   for _ in range(2):subprocess.run(cmd,check=True,capture_output=True)
   self.assertEqual(main.read_text().count('route(OLAMIDE_PUSH_WAKE);'),1);self.assertEqual(auth.read_text().count('ts_append('),1)
   main.write_text('#!include_file "olamide-auth.cfg"\nrequest_route {}');self.assertNotEqual(subprocess.run(cmd,capture_output=True).returncode,0)
if __name__=='__main__':unittest.main()
