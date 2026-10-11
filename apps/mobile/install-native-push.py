#!/usr/bin/env python3
"""Idempotently install Android push files into a generated Capacitor project."""
import argparse,json,shutil,xml.etree.ElementTree as ET
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--google-services',required=True);args=p.parse_args()
root=Path(__file__).resolve().parent;android=root/'android';config=json.loads(Path(args.google_services).read_text());app_id='com.dobhrap.olamide'
client=next((c for c in config.get('client',[]) if c.get('client_info',{}).get('android_client_info',{}).get('package_name')==app_id),None)
if not client:raise SystemExit('Firebase config does not contain com.dobhrap.olamide')
manifest=android/'app/src/main/AndroidManifest.xml'
if not manifest.exists():raise SystemExit('Generate the Capacitor Android project first')
ns='http://schemas.android.com/apk/res/android';ET.register_namespace('android',ns);attr=lambda s:'{'+ns+'}'+s
tree=ET.parse(manifest);m=tree.getroot()
for permission in ['POST_NOTIFICATIONS','RECORD_AUDIO','FOREGROUND_SERVICE','FOREGROUND_SERVICE_MICROPHONE']:
 name='android.permission.'+permission
 if not any(e.get(attr('name'))==name for e in m.findall('uses-permission')):ET.SubElement(m,'uses-permission',{attr('name'):name})
a=m.find('application');name='com.dobhrap.olamide.OlamideMessagingService'
if not any(e.get(attr('name'))==name for e in a.findall('service')):
 service=ET.SubElement(a,'service',{attr('name'):name,attr('exported'):'false'});intent=ET.SubElement(service,'intent-filter');ET.SubElement(intent,'action',{attr('name'):'com.google.firebase.MESSAGING_EVENT'})
if not any(e.get(attr('name'))=='com.dobhrap.olamide.OlamideCallService' for e in a.findall('service')):
 ET.SubElement(a,'service',{attr('name'):'com.dobhrap.olamide.OlamideCallService',attr('exported'):'false',attr('foregroundServiceType'):'microphone'})
tree.write(manifest,encoding='utf-8',xml_declaration=True)
target=android/'app/src/main/java/com/dobhrap/olamide';target.mkdir(parents=True,exist_ok=True)
for file in (root/'push-native').glob('*.java'):shutil.copyfile(file,target/file.name)
activity=target/'MainActivity.java'
if not activity.exists():shutil.copyfile(root/'carrier-native/MainActivity.java',activity);shutil.copyfile(root/'carrier-native/CarrierBrandPlugin.java',target/'CarrierBrandPlugin.java')
s=activity.read_text()
if 'registerPlugin(NativePushPlugin.class)' not in s:s=s.replace('super.onCreate(savedInstanceState);','registerPlugin(NativePushPlugin.class);\n        super.onCreate(savedInstanceState);');activity.write_text(s)
build=android/'app/build.gradle';s=build.read_text();line='apply from: "../../native-push.gradle"'
if line not in s:build.write_text(s+'\n'+line+'\n')
resources=ET.Element('resources');project=config['project_info'];values={'google_app_id':client['client_info']['mobilesdk_app_id'],'google_api_key':client['api_key'][0]['current_key'],'gcm_defaultSenderId':project['project_number'],'project_id':project['project_id']}
for key,value in values.items():ET.SubElement(resources,'string',{'name':key,'translatable':'false'}).text=value
res=android/'app/src/main/res/values';res.mkdir(parents=True,exist_ok=True);ET.ElementTree(resources).write(res/'native_push.xml',encoding='utf-8',xml_declaration=True)
print('Android native push installed. Build and install the APK to test incoming calls.')
