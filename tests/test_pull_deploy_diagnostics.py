"""Exercise failure reporting without touching an installation or running Docker."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'deployment/pull-and-deploy.sh'

class DeploymentDiagnostics(unittest.TestCase):
    def run_case(self, dirty):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / 'repo'
            (repo / 'deployment/docker').mkdir(parents=True)
            (repo / 'deployment/docker/.env').write_text('PRIVATE=value\n')
            tools = root / 'bin'
            tools.mkdir()
            git = tools / 'git'
            git.write_text('''#!/bin/bash
case "$1" in
 remote) echo https://github.com/olamidebello/Sip.git ;;
 status) %s ;;
 fetch) echo PRIVATE_FETCH_DIAGNOSTIC; exit 2 ;;
 *) exit 90 ;;
esac
''' % ("echo ' M services/api/onboarding.js'" if dirty else ':'))
            git.chmod(0o755)
            source = SOURCE.read_text().replace('/opt/olamide/repo', str(repo)).replace('/opt/olamide/backups', str(root / 'backups')).replace('/run/olamide-update.lock', str(root / 'deploy.lock'))
            # Permit the same isolated test to run on an unprivileged CI worker.
            source = source.replace('[[ $EUID == 0 ]]', '[[ 1 == 1 ]]')
            script = root / 'run.sh'
            script.write_text(source)
            result = subprocess.run(['bash', str(script)], env={**os.environ, 'PATH': str(tools)+os.pathsep+os.environ['PATH']}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            phase = 'local_changes' if dirty else 'git_fetch'
            self.assertRegex(result.stdout, '^SIP_DEPLOY_ERROR phase='+phase+r' log=.+\n$')
            self.assertEqual(result.stderr, '')
            self.assertNotIn('PRIVATE_FETCH_DIAGNOSTIC', result.stdout)
            log = Path(re.search(r'log=(.+)', result.stdout)[1])
            self.assertEqual(log.stat().st_mode & 0o777, 0o600)
            if not dirty:
                self.assertIn('PRIVATE_FETCH_DIAGNOSTIC', log.read_text())
            self.assertEqual((repo / 'deployment/docker/.env').read_text(), 'PRIVATE=value\n')

    def test_dirty_checkout_reports_phase_without_changing_files(self):
        self.run_case(True)

    def test_fetch_failure_keeps_command_output_in_private_log(self):
        self.run_case(False)

if __name__ == '__main__':
    unittest.main()
