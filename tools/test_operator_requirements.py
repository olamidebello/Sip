import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from tools.operator_requirements import coverage
from tools.prepare_operator_runner import prepare

spec = importlib.util.spec_from_file_location('operator_runner', Path(__file__).resolve().parents[1] / 'deploy/ansible/runner.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)

class OperatorRequirementsTests(unittest.TestCase):
    def test_catalog_coverage_preserves_real_blockers(self):
        result = coverage(Path(__file__).resolve().parents[1])
        self.assertFalse(result['fullyOperational'])
        self.assertGreater(result['features'], 40)
        self.assertTrue(any(row['status'] == 'not_implemented' for row in result['remaining']))

    def test_catalog_drift_stops_installation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for path, rows in [('services/api/telecomFeatureCatalog.json', []), ('apps/web/src/advancedTelecomCatalog.json', [{'id': 'bad'}])]:
                target = root / path
                target.parent.mkdir(parents=True)
                target.write_text(json.dumps(rows))
            with self.assertRaises(AssertionError):
                coverage(root)

    @unittest.skipUnless(os.geteuid() == 0, 'Private bootstrap requires root ownership')
    def test_bootstrap_preserves_token_and_private_modes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            path = root / 'secrets.env'
            path.write_text('DOMAIN=sip.example.com\nOPERATOR_LOCAL_HOST=192.0.2.10\nDEPLOY_RUNNER_TOKEN=\n')
            path.chmod(0o600)
            prepare(root)
            first = (root / 'operator-runner.conf').read_text()
            prepare(root)
            self.assertEqual(first, (root / 'operator-runner.conf').read_text())
            self.assertEqual((root / 'operator-runner.conf').stat().st_mode & 0o777, 0o600)
            self.assertNotIn('DEPLOY_RUNNER_TOKEN=\n', first)

    def test_worker_rejects_host_or_user_injection_before_execution(self):
        with patch.object(runner.subprocess, 'run') as run:
            for node in [{'host': '192.0.2.10;id', 'ssh_user': 'root', 'ssh_port': 22},
                         {'host': '192.0.2.10', 'ssh_user': 'root;id', 'ssh_port': 22},
                         {'host': '192.0.2.10', 'ssh_user': 'root', 'ssh_port': 0}]:
                with self.assertRaises(ValueError):
                    runner.operator_setup(node)
            run.assert_not_called()


class OperatorWorkerTests(unittest.TestCase):
    def test_success_is_reported_only_after_installer_returns(self):
        calls = []
        job = {'id': 'job', 'action': 'operator_setup', 'host': '192.0.2.10', 'ssh_user': 'root', 'ssh_port': 22}
        def request(base, token, route, body=None):
            calls.append((route, body))
            return {'nodes': []} if route == 'nodes' else {'job': job} if route == 'claim' else {}
        with patch.object(runner, 'request', side_effect=request), patch.object(runner, 'operator_setup') as install:
            runner.run_once('https://example.com', 'private', 'runner-id', '', '', '192.0.2.10')
            install.assert_called_once_with(job, '192.0.2.10')
        result = next(body for route, body in calls if route == 'result')
        self.assertEqual(result['status'], 'succeeded')
        self.assertNotIn('switch active', result['summary'])

    def test_installer_failure_is_persisted(self):
        calls = []
        def request(base, token, route, body=None):
            calls.append((route, body))
            return {'nodes': []} if route == 'nodes' else {'job': {'id': 'job', 'action': 'operator_setup'}} if route == 'claim' else {}
        with patch.object(runner, 'request', side_effect=request), patch.object(runner, 'operator_setup', side_effect=RuntimeError('CI pending')):
            runner.run_once('https://example.com', 'private', 'runner-id', '', '')
        self.assertEqual(next(body for route, body in calls if route == 'result')['status'], 'failed')

if __name__ == '__main__':
    unittest.main()
