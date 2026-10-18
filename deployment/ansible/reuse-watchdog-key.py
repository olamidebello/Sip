#!/usr/bin/env python3
"""Reuse the active API container's key during Compose interpolation, without a secret file."""
import json,os,subprocess,sys

def inherited_environment(config,current):
 env=dict(current)
 values=dict(item.split('=',1) for item in config.get('Env',[]) if '=' in item)
 key=values.get('OPENAI_API_KEY') or values.get('OPENAI_SUPPORT_API_KEY')
 if key:env['OPENAI_API_KEY']=key
 return env
if __name__=='__main__':
 if sys.argv[1:3]!=['docker','compose']:raise SystemExit('Expected trusted Compose deployment command')
 try:
  inspected=subprocess.run(['docker','inspect','docker-api-1'],capture_output=True,check=True,text=True)
  config=json.loads(inspected.stdout)[0]['Config']
  env=inherited_environment(config,os.environ)
  raise SystemExit(subprocess.run(sys.argv[1:],env=env).returncode)
 except (subprocess.CalledProcessError,ValueError,KeyError):raise SystemExit('Could not inspect existing API runtime configuration; no key was exposed')
