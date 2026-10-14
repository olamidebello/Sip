#!/usr/bin/env python3
"""Read-only, credential-safe prerequisites; does not fabricate provider credentials."""
import argparse,json,subprocess,socket,ssl,time,datetime

def command(argv):
 try:
  r=subprocess.run(argv,capture_output=True,text=True,timeout=20);return r.returncode,r.stdout
 except (OSError,subprocess.TimeoutExpired):return 1,''
def served_certificate(domain,host='127.0.0.1',connect=None,context_factory=None,now=None):
 """Verify the TLS terminator with SNI and trusted CA/hostname checks, never reading private keys."""
 connect=connect or socket.create_connection
 context_factory=context_factory or ssl.create_default_context
 now=time.time() if now is None else now
 try:
  context=context_factory()
  if context.verify_mode!=ssl.CERT_REQUIRED or not context.check_hostname:
   return {'status':'verification_failed','source':'served_https_sni'}
  with connect((host,443),timeout=5) as connection:
   with context.wrap_socket(connection,server_hostname=domain) as tls:
    expires=ssl.cert_time_to_seconds(tls.getpeercert()['notAfter'])
  return {'status':'valid_for_at_least_14_days' if expires-now>=1209600 else 'expiring_within_14_days','source':'served_https_sni','notAfterUtc':datetime.datetime.fromtimestamp(expires,datetime.timezone.utc).isoformat()}
 except ssl.SSLCertVerificationError:
  return {'status':'verification_failed','source':'served_https_sni'}
 except (OSError,ssl.SSLError,ValueError,KeyError,TypeError):
  return {'status':'unavailable','source':'served_https_sni'}

def check(domain='sip.dobhrap.com',run=command,certificate_probe=None,tls_host='127.0.0.1'):
 if not domain or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-' for c in domain):raise ValueError('Valid host required')
 checks={}
 for name,unit in [('kamailio','kamailio'),('mediaRelay','rtpengine-daemon'),('optionalPbx','olamide-pbx')]:checks[name]='active' if run(['systemctl','is-active','--quiet',unit])[0]==0 else 'not_active'
 certificate=(certificate_probe or (lambda name:served_certificate(name,host=tls_host)))(domain)
 checks['tlsCertificate']=certificate['status']
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
 return {'checks':checks,'certificate':certificate,'providers':providers,'portabilityIntegration':'not_implemented','stirShakenSigning':'not_implemented','fullRequirementsReady':False,'scope':'Presence and process checks only; provider accounts, licenses, signing certificates and portability datasets are not generated. PBX configuration and real media require acceptance testing.'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--domain',default='sip.dobhrap.com');p.add_argument('--tls-host',default='127.0.0.1');a=p.parse_args();print(json.dumps(check(a.domain,tls_host=a.tls_host),indent=2))
