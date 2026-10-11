#!/usr/bin/env python3
"""Provision Android FCM config using an already-authorized gcloud identity."""
import argparse,base64,json,os,re,subprocess,time,urllib.request,urllib.error,urllib.parse
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('--project',required=True);p.add_argument('--output-dir',required=True);args=p.parse_args()
 if not re.fullmatch(r'[a-z][a-z0-9-]{4,62}',args.project):raise SystemExit('Valid existing Google Cloud project ID required')
 os.umask(0o077);out=Path(args.output_dir);out.mkdir(parents=True,exist_ok=True);os.chmod(out,0o700)
 def gcloud(*parts):
  r=subprocess.run(['gcloud',*parts,'--quiet'],capture_output=True,text=True)
  if r.returncode:raise RuntimeError('Authorized Google Cloud operation failed; check gcloud IAM access and organization policies')
  return r.stdout.strip()
 gcloud('projects','describe',args.project,'--format=value(projectId)')
 gcloud('services','enable','firebase.googleapis.com','fcm.googleapis.com','--project',args.project)
 token=gcloud('auth','print-access-token')
 def api(path,method='GET',body=None):
  req=urllib.request.Request('https://firebase.googleapis.com/v1beta1/'+path,data=None if body is None else json.dumps(body).encode(),method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','x-goog-user-project':args.project})
  with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
 def operation(result):
  deadline=time.monotonic()+180
  while not result.get('done'):
   if time.monotonic()>deadline:raise RuntimeError('Firebase operation timed out; rerun to reconcile project and app state')
   time.sleep(2);result=api(result['name'])
  if result.get('error'):raise RuntimeError('Firebase management operation failed; check project permissions')
  return result.get('response',{})
 try:api('projects/'+args.project)
 except urllib.error.HTTPError as e:
  if e.code!=404:raise
  operation(api('projects/'+args.project+':addFirebase','POST',{}))
 apps=[];next_page=None
 while True:
  route='projects/'+args.project+'/androidApps'+(('?pageToken='+urllib.parse.quote(next_page)) if next_page else '')
  listing=api(route);apps+=listing.get('apps',[]);next_page=listing.get('nextPageToken')
  if not next_page:break
 app=next((a for a in apps if a.get('packageName')=='com.dobhrap.olamide' and a.get('state','ACTIVE')=='ACTIVE'),None)
 if not app:app=operation(api('projects/'+args.project+'/androidApps','POST',{'packageName':'com.dobhrap.olamide','displayName':'Olamide'}))
 config=api(app['name']+'/config');android=base64.b64decode(config['configFileContents']);parsed=json.loads(android)
 if parsed.get('project_info',{}).get('project_id')!=args.project:raise RuntimeError('Firebase Android project mismatch')
 account_id='olamide-native-push';email=account_id+'@'+args.project+'.iam.gserviceaccount.com'
 accounts=json.loads(gcloud('iam','service-accounts','list','--project',args.project,'--format=json'))
 if not any(a.get('email')==email for a in accounts):gcloud('iam','service-accounts','create',account_id,'--project',args.project,'--display-name=Olamide native push')
 gcloud('projects','add-iam-policy-binding',args.project,'--member=serviceAccount:'+email,'--role=roles/firebasecloudmessaging.admin','--condition=None','--format=json')
 key=out/'firebase-service-account.json'
 if key.exists():
  existing=json.loads(key.read_text())
  if existing.get('project_id')!=args.project or existing.get('client_email')!=email:raise RuntimeError('Existing service-account file belongs to another identity; refusing replacement')
 else:gcloud('iam','service-accounts','keys','create',str(key),'--iam-account='+email,'--project',args.project)
 os.chmod(key,0o600);config_file=out/'google-services.json';config_file.write_bytes(android);os.chmod(config_file,0o600)
 print('Firebase Android app and FCM sender configured; private credential files written.')
if __name__=='__main__':
 try:main()
 except urllib.error.HTTPError as e:raise SystemExit('Firebase API rejected the request (HTTP '+str(e.code)+'); verify authorized Google identity and project access')
 except (RuntimeError,FileNotFoundError) as e:raise SystemExit(str(e))
