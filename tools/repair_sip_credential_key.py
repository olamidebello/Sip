#!/usr/bin/env python3
"""Restore a saved key only after verifying every encrypted SIP account."""
import pathlib,re,json,subprocess,os,shutil,datetime,sys

def select_key(report,current):
 total=report['total']
 if total==0:return None
 if report['matches'][current]==total:return current
 winners=[i for i,n in enumerate(report['matches']) if n==total]
 if len(winners)!=1:raise ValueError('No unique saved key decrypts every account; preserve keys and investigate backups')
 return winners[0]

NODE=r"""
const fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
 const keys=JSON.parse(fs.readFileSync(0,'utf8'));
 const {createDatabase}=await import('./db.js');const p=createDatabase(process.env.MYSQL_URL);
 try{const rows=(await p.query('SELECT secret_cipher FROM sip_accounts WHERE secret_cipher IS NOT NULL')).rows;
 const matches=keys.map(k=>rows.filter(r=>{try{const b=Buffer.from(r.secret_cipher);const d=crypto.createDecipheriv('aes-256-gcm',Buffer.from(k,'hex'),b.subarray(0,12));d.setAuthTag(b.subarray(b.length-16));d.update(b.subarray(12,-16));d.final();return true;}catch{return false;}}).length);
 console.log(JSON.stringify({total:rows.length,matches}));
 }finally{await p.end();}
})().catch(e=>{console.error(e.code||e.name);process.exit(1)});
"""

def main():
 paths=[pathlib.Path('/etc/olamide/secrets.env'),pathlib.Path('/opt/olamide/repo/deployment/docker/.env')]
 keys=[];labels=[]
 for p in paths:
  if not p.is_file():continue
  values=re.findall(r'^SIP_CREDENTIAL_KEY=(.*)$',p.read_text(),re.M)
  if len(values)>1:raise ValueError('Duplicate key entry in '+str(p))
  if values:
   key=values[0].strip().strip('"\'').lower()
   if re.fullmatch('[0-9a-f]{64}',key):
    if key not in keys:keys.append(key);labels.append(str(p))
 if not keys or labels[0]!='/etc/olamide/secrets.env':raise ValueError('Canonical SIP key missing or invalid')
 cmd=['docker','compose','--env-file','/etc/olamide/secrets.env','exec','-T','api','node','-e',NODE]
 result=subprocess.run(cmd,cwd='/opt/olamide/repo/deployment/docker',input=json.dumps(keys),text=True,capture_output=True)
 if result.returncode:raise ValueError('Credential verification could not query the running API; inspect API health')
 report=json.loads(result.stdout)
 print('Encrypted SIP accounts:',report['total'])
 for label,n in zip(labels,report['matches']):print(label+': decrypts '+str(n)+' accounts')
 winner=select_key(report,0)
 if winner is None or winner==0:print('Existing canonical key retained');return
 if '--repair' not in sys.argv:print('A verified previous key is available; rerun with --repair');return
 p=paths[0];text=p.read_text();backup=p.with_name('secrets.env.before-sip-key-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
 shutil.copyfile(p,backup);os.chmod(backup,0o600)
 text=re.sub(r'^SIP_CREDENTIAL_KEY=.*$', 'SIP_CREDENTIAL_KEY='+keys[winner],text,flags=re.M)
 tmp=p.with_suffix('.key-repair.tmp');tmp.write_text(text);os.chmod(tmp,0o600);tmp.replace(p)
 print('Restored verified saved SIP encryption key; rebuild/recreate API to apply')
if __name__=='__main__':
 try:main()
 except Exception as e:print('SIP key check: FAIL - '+str(e));sys.exit(1)
