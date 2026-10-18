#!/usr/bin/env python3
"""Run fixed, isolated feature regression suites and spool results for super admin."""
import importlib.util,sqlite3,time,fcntl,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('monitor',Path(__file__).with_name('platform-watchdog.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def main():
 m.ROOT.mkdir(parents=True,exist_ok=True,mode=0o700)
 with open('/run/olamide-update.lock','a') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:return
  db=sqlite3.connect(m.ROOT/'events.sqlite',timeout=30);m.init(db)
  suites=[('checks/api','olamide-api:local',['didShop.test.js','didSms.test.js','pstnBilling.test.js','kamailioHttpBridge.test.js','defaultCallingPlan.test.js','callingPlanAdmin.test.js','platformWatchdog.test.js']),('checks/ui','olamide-web:watchdog-tests',['src/didShopUi.test.js','src/platformWatchdogUi.test.js'])]
  for component,image,tests in suites:
   name='olamide-watchdog-tests-'+component.split('/')[1]
   try:
    result=m.run(['docker','run','--rm','--name',name,'--network','none','--memory','384m','--cpus','1','--entrypoint','node',image,'--test',*tests],timeout=180)
    passed=result.returncode==0
   except Exception:passed=False
   finally:subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   m.emit(db,component,'health','info' if passed else 'error','tests_passed' if passed else 'tests_failed')
  db.close()
if __name__=='__main__':main()
