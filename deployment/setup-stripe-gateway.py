#!/usr/bin/env python3
"""Pass a root-private Stripe key through stdin, never process arguments or logs."""
import argparse,json,os,stat,subprocess,sys
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('--key-file',default='/etc/olamide/stripe-api-key');p.add_argument('--admin-email',default='');p.add_argument('--tenant-id',default='');p.add_argument('--min-cents',type=int,default=100);p.add_argument('--max-cents',type=int,default=100000);p.add_argument('--invoice-only',action='store_true');args=p.parse_args()
 payload={'adminEmail':args.admin_email,'tenantId':args.tenant_id,'minCents':args.min_cents,'maxCents':args.max_cents,'enableTopups':not args.invoice_only}
 for filename,field in [(args.key_file,'secretKey'),('/etc/olamide/stripe-webhook-secret','webhookSecret')]:
  keyfile=Path(filename)
  if keyfile.is_symlink():raise SystemExit('Stripe secret file must not be a symlink')
  if keyfile.exists():
   fd=os.open(keyfile,os.O_RDONLY|os.O_NOFOLLOW)
   with os.fdopen(fd) as stream:
    info=os.fstat(stream.fileno())
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)&0o077:raise SystemExit('Stripe secret file must be root-owned and mode 0600')
    value=stream.read(1024).strip()
   if not value:raise SystemExit('Stripe secret file is empty')
   payload[field]=value
 runtime=Path(__file__).resolve().parent/'wallet-funding/compose-runtime.py'
 command=[sys.executable,str(runtime),'run','--rm','--no-deps','-T','api','node','setupStripeGateway.js']
 result=subprocess.run(command,input=json.dumps(payload),text=True)
 raise SystemExit(result.returncode)
if __name__=='__main__':main()
