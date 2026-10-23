"""Configure a generated Capacitor Android project for reproducible Play artifacts."""
import os
import re
from pathlib import Path

def prepare(root, version):
    if not re.fullmatch(r'[1-9][0-9]{0,8}', str(version)):
        raise ValueError('A positive numeric build version below 1000000000 is required')
    variables = root / 'variables.gradle'
    build = root / 'app/build.gradle'
    values = variables.read_text()
    source = build.read_text()
    for key in ('compileSdkVersion', 'targetSdkVersion'):
        values, count = re.subn(r'(?m)^(\s*' + key + r'\s*=\s*)\d+', r'\g<1>36', values)
        if count != 1:
            raise ValueError('Unknown generated Android SDK configuration: ' + key)
    source, count = re.subn(r'(?m)^(\s*versionCode\s+)\d+', lambda m: m[1] + str(version), source)
    if count != 1:
        raise ValueError('Unknown generated Android versionCode configuration')
    source, count = re.subn(r'(?m)^(\s*versionName\s+)["\'][^"\']+["\']', lambda m: m[1] + '"0.1.' + str(version) + '"', source)
    if count != 1:
        raise ValueError('Unknown generated Android versionName configuration')
    variables.write_text(values)
    build.write_text(source)

if __name__ == '__main__':
    prepare(Path(__file__).parent / 'android', os.environ['OLAMIDE_ANDROID_VERSION_CODE'])
    print('Android API 36 and build version configured. Signing and store approval remain separate.')
