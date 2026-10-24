"""Report only public test identifiers and fixed error codes from private test logs."""
import argparse
import ast
import hashlib
from pathlib import Path
import re

def summarize(text,source):
 suites=['pstnDigest.test.js','flowrouteSetup.test.js','trunkAdmin.test.js','quickSignup.test.js','adminGroup.test.js','trunkManagement.test.js','locationReportAddress.test.js','locationReports.test.js']
 titles={}
 for area in ['services/api','apps/web/src']:
  for name in suites:
   p=source/area/name
   if not p.is_file():continue
   for match in re.finditer(r'''\btest\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*,''',p.read_text(),re.S):
    try:title=ast.literal_eval(match[1]+match[2]+match[1])
    except (SyntaxError,ValueError):continue
    if isinstance(title,str):titles.setdefault(title,set()).add(name)
 output=set()
 for line in text.splitlines():
  match=re.match(r'\s*(?:not ok \d+ - |✖ )(.+?)(?: \([0-9.]+m?s\))?\s*$',line)
  if not match:continue
  title=match[1].strip()
  if title in titles:
   label=re.sub('[^a-z0-9]+','_',title.lower()).strip('_')[:100]
   for name in titles[title]:output.add('SIP_FEATURE_TEST file='+name+' check=failed name='+label)
  else:
   file=Path(title.split(' ')[0]).name
   if file in suites:output.add('SIP_FEATURE_TEST file='+file+' check=suite_failed')
 for code in ['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND','ERR_ASSERTION','SyntaxError','ReferenceError','TypeError']:
  if re.search(r'\b'+code+r'\b',text):output.add('SIP_FEATURE_TEST check='+code.lower())
 known={p.name for p in (source/'services/api').glob('*.js')}
 for match in re.finditer(r"Cannot find module ['\"]([^'\"]+)['\"]",text):
  name=Path(match[1]).name
  if name in known:output.add('SIP_FEATURE_TEST file='+name+' check=module_not_found')
 for match in re.finditer(r'(?:file://)?/app/([A-Za-z0-9_.-]+\.(?:js|mjs)):(\d+):(\d+)',text):
  if match[1] in known:output.add('SIP_FEATURE_TEST file='+match[1]+' check=stack line='+match[2]+' column='+match[3])
 members=set()
 for p in (source/'services/api').glob('*.js'):
  members.update(re.findall(r'\.([A-Za-z_$][A-Za-z0-9_$]*)',p.read_text()))
 for match in re.finditer(r"Cannot read properties of (?:undefined|null) \(reading ['\"]([A-Za-z_$][A-Za-z0-9_$]*)['\"]\)",text):
  if match[1] in members:output.add('SIP_FEATURE_TEST check=undefined_property property='+match[1])
 for match in re.finditer(r'\b[A-Za-z_$][A-Za-z0-9_$]*\.([A-Za-z_$][A-Za-z0-9_$]*) is not a function',text):
  if match[1] in members:output.add('SIP_FEATURE_TEST check=missing_method member='+match[1])
 return sorted(output) or ['SIP_FEATURE_TEST check=unclassified_failure']

def fingerprints(directory):
 output=[]
 for name in ['sipMarketplace.js','defaultPresence.js','messagingWebhooks.js','subscriberRouting.js','twilioAccountAuth.js']:
  p=directory/'stage/services/api'/name
  if p.is_file():
   data=p.read_bytes();blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
   output.append('SIP_FEATURE_TEST file='+name+' check=source_blob value='+blob)
 return output

def main():
 parser=argparse.ArgumentParser();parser.add_argument('log',nargs='?',type=Path);parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--latest',action='store_true');args=parser.parse_args()
 log=args.log
 if args.latest:
  files=[]
  for pattern in ['local-features-*/backend-tests.tap','local-features-*/browser-tests.tap','local-features-*/deploy.log']:
   files.extend(Path('/opt/olamide/backups').glob(pattern))
  if not files:raise SystemExit('No feature deployment logs found')
  directory=max(files,key=lambda p:p.stat().st_mtime).parent
  text='\n'.join(p.read_text(errors='replace') for p in [directory/'deploy.log',directory/'backend-tests.tap',directory/'browser-tests.tap'] if p.is_file())
 else:
  if not log or not log.is_file():raise SystemExit('Feature test log not found')
  text=log.read_text(errors='replace')
 output=summarize(text,args.source.resolve())
 if args.latest:output.extend(fingerprints(directory))
 print('\n'.join(output))
if __name__=='__main__':main()
