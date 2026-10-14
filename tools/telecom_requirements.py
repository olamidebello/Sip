#!/usr/bin/env python3
"""Read-only, credential-safe prerequisites; does not fabricate provider credentials."""
import argparse,json,pathlib,subprocess

def command(argv):
 try:
  r=subprocess.run(argv,capture_output=True,text=True,timeout=20);return r.returncode,r.stdout
 except (OSError,subprocess.TimeoutExpired):return 1,''
def check(domain='sip.dobhrap.com',run=command):
 if not domain or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-' for c in domain):raise ValueError('Valid host required')
 cert=f'/etc/letsencrypt/live/{domain}/fullchain.pem'
 checks={}
 for name,unit in [('kamailio','kamailio'),('mediaRelay','rtpengine-daemon'),('optionalPbx','olamide-pbx')]:checks[name]='active' if run(['systemctl','is-active','--quiet',unit])[0]==0 else 'not_active'
 rc,_=run(['openssl','x509','-in',cert,'-noout','-checkend','1209600']);checks['tlsCertificate']='valid_for_at_least_14_days' if rc==0 else 'missing_or_expiring'
 # Only aggregate encrypted credential presence is returned. Presence is not a provider authentication test.
 code="import {createDatabase} from './db.js';const p=createDatabase(process.env.MYSQL_URL);try{const r=await p.query('SELECT provider,COUNT(*) AS n FROM provider_api_credentials WHERE enabled=TRUE GROUP BY provider');console.log(JSON.stringify(r.rows.map(x=>({provider:x.provider,count:Number(x.n)}))));}finally{await p.end();}"
 rc,out=run(['docker','compose','--env-file','/etc/olamide/secrets.env','-f','/opt/olamide/repo/deployment/docker/compose.yml','exec','-T','api','node','--input-type=module','-e',code])
 providers=[]
 if rc==0:
  try:
   for row in json.loads(out):
    if row.get('provider') in ('flowroute','didww','dwolla','flutterwave') and type(row.get('count')) is int and row['count']>=0:providers.append({'provider':row['provider'],'configuredCredentialRecords':row['count'],'providerAuthentication':'unverified'})
  except (ValueError,TypeError,AttributeError):pass
 checks['providerCredentialInventory']='available' if rc==0 else 'unavailable'
 return {'checks':checks,'providers':providers,'portabilityIntegration':'not_implemented','stirShakenSigning':'not_implemented','fullRequirementsReady':False,'scope':'Presence and process checks only; provider accounts, licenses, signing certificates and portability datasets are not generated. PBX configuration and real media require acceptance testing.'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--domain',default='sip.dobhrap.com');a=p.parse_args();print(json.dumps(check(a.domain),indent=2))
