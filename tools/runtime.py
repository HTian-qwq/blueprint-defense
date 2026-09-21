"""Locate Node for development checks without depending on a specific user profile."""
import os
import shutil
from pathlib import Path


def node_environment(root):
    root = Path(root)
    bundled = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node'
    fallback = bundled / 'bin' / ('node.exe' if os.name == 'nt' else 'node')
    node = os.environ.get('NODE_BINARY') or shutil.which('node')
    if not node and fallback.is_file():
        node = str(fallback)
    if not node:
        raise SystemExit('Node.js is required for tests. Install Node.js or set NODE_BINARY.')
    env = {**os.environ, 'NODE_BINARY': str(node), 'PYTHONIOENCODING': 'utf-8'}
    # npm install is the normal setup. A bundled runtime is an optional local fallback.
    paths = [str(root / 'node_modules')]
    if env.get('NODE_PATH'):
        paths.append(env['NODE_PATH'])
    if (bundled / 'node_modules/playwright').is_dir():
        paths.append(str(bundled / 'node_modules'))
    env['NODE_PATH'] = os.pathsep.join(paths)
    return str(node), env
