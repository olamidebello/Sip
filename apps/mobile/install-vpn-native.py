#!/usr/bin/env python3
"""Install embedded WireGuard support into the generated Capacitor Android project."""
from pathlib import Path
import shutil,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parent;app=root/'android/app';manifest=app/'src/main/AndroidManifest.xml'
if not manifest.exists():raise SystemExit('Generate Android project first')
target=app/'src/main/java/com/dobhrap/olamide';target.mkdir(parents=True,exist_ok=True)
shutil.copyfile(root/'vpn-native/OlamideVpnPlugin.java',target/'OlamideVpnPlugin.java')
activity=target/'MainActivity.java';s=activity.read_text()
if 'registerPlugin(OlamideVpnPlugin.class)' not in s:
 anchor='super.onCreate(savedInstanceState);'
 if s.count(anchor)!=1:raise SystemExit('Unknown MainActivity layout')
 activity.write_text(s.replace(anchor,'registerPlugin(OlamideVpnPlugin.class);\n        '+anchor))
ns='http://schemas.android.com/apk/res/android';ET.register_namespace('android',ns);a=lambda s:'{'+ns+'}'+s
tree=ET.parse(manifest);m=tree.getroot()
for name in ['android.permission.INTERNET','android.permission.ACCESS_NETWORK_STATE']:
 if not any(p.get(a('name'))==name for p in m.findall('uses-permission')):ET.SubElement(m,'uses-permission',{a('name'):name})
# GoBackend's AAR manifest supplies the protected VpnService declaration.
tree.write(manifest,encoding='utf-8',xml_declaration=True)
p=app/'build.gradle';s=p.read_text()
if '// OLAMIDE_EMBEDDED_VPN_V1' not in s:
 s+='''\n// OLAMIDE_EMBEDDED_VPN_V1
android { compileOptions { coreLibraryDesugaringEnabled true } }
dependencies {
    implementation 'com.wireguard.android:tunnel:1.0.20260102'
    coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.5'
}
'''
 p.write_text(s)
print('Embedded WireGuard client installed; no shared VPN private keys packaged in APK.')
