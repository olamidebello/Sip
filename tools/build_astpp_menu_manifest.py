#!/usr/bin/env python3
"""Resolve exact GUI routes against the pinned Community source, without executing PHP."""
import argparse, json, pathlib, re, subprocess
PIN = '9479778d1c9a325fc28b0265575f256703626077'
ROOT = pathlib.Path(__file__).resolve().parents[1]

def build(source, menus):
    source = pathlib.Path(source)
    commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    if commit != PIN:
        raise ValueError('ASTPP checkout does not match the runtime pin')
    modules = source / 'web_interface/astpp/application/modules'
    schema = '\n'.join((source / 'database' / name).read_text() for name in ['astpp-6.0.sql', 'astpp-6.0.1.sql'])
    tables = set(re.findall(r'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`([^`]+)`', schema, re.I))
    result = []
    for menu in menus:
        parts = menu['path'].strip('/').split('/')
        if len(parts) < 2 or any(not re.fullmatch(r'[\w-]+', p) for p in parts):
            raise ValueError('Invalid native menu route')
        module, method = parts[:2]
        controller = modules / module / 'controllers' / (module + '.php')
        text = controller.read_text() if controller.exists() else ''
        available = bool(re.search(r'\bfunction\s+' + re.escape(method) + r'\s*\(', text, re.I))
        models = sorted(p.relative_to(modules.parent).as_posix() for p in (modules/module/'models').glob('*.php'))
        module_text = text + '\n' + '\n'.join((modules.parent / p).read_text() for p in models)
        # Literal references only. Runtime/dynamically selected dependencies remain unverified.
        refs = sorted(t for t in tables if re.search(r"['\"`]" + re.escape(t) + r"['\"`]", module_text))
        result.append({**menu, 'controller': controller.relative_to(modules.parent).as_posix(),
                       'method': method, 'models': models, 'tables': refs,
                       'codeAvailable': available,
                       'httpCheck': 'skip_upstream_get_changes_permissions' if module == 'addons' else 'enabled',
                       'runtime': 'unverified' if available else 'missing_upstream_module',
                       'switchAcceptance': 'unverified'})
    return {'upstreamCommit': commit, 'scope': 'Community source wiring; literal table references are not exhaustive. Runtime and live switch acceptance require separate checks.', 'menus': result}

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--source', required=True); p.add_argument('--output', required=True)
    args = p.parse_args()
    menus = json.loads((ROOT/'apps/web/src/nativeAstppMenus.json').read_text())
    pathlib.Path(args.output).write_text(json.dumps(build(args.source, menus), indent=2)+'\n')
