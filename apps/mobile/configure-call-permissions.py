#!/usr/bin/env python3
from pathlib import Path
import xml.etree.ElementTree as ET

def configure(path):
 ns='http://schemas.android.com/apk/res/android';ET.register_namespace('android',ns);key='{'+ns+'}name';tree=ET.parse(path);root=tree.getroot()
 for permission in ['INTERNET','RECORD_AUDIO','CAMERA','MODIFY_AUDIO_SETTINGS']:
  value='android.permission.'+permission
  if not any(p.get(key)==value for p in root.findall('uses-permission')):ET.SubElement(root,'uses-permission',{key:value})
 for feature in ['android.hardware.camera','android.hardware.microphone']:
  entry=next((f for f in root.findall('uses-feature') if f.get(key)==feature),None)
  if entry is None:entry=ET.SubElement(root,'uses-feature',{key:feature})
  entry.set('{'+ns+'}required','false')
 tree.write(path,encoding='utf-8',xml_declaration=True)
if __name__=='__main__':configure(Path(__file__).parent/'android/app/src/main/AndroidManifest.xml')
