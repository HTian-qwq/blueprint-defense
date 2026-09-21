"""Verify the actual release ZIP from an isolated static server and URL subdirectory."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from threading import Thread
import zipfile

from runtime import node_environment

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    node, env = node_environment(ROOT)
    archive_path = ROOT/'dist/blueprint-defense-web.zip'
    build = json.loads((ROOT/'reports/web_build.json').read_text('utf-8'))
    fonts = json.loads((ROOT/'assets/fonts/subsets/manifest.json').read_text('utf-8'))
    with tempfile.TemporaryDirectory(prefix='release-', dir=ROOT/'reports') as temporary:
        folder = Path(temporary)
        with zipfile.ZipFile(archive_path) as archive:
            expected = {'index.html', 'blueprint_defense.html', '_headers', *build['files']}
            assert set(archive.namelist()) == expected
            assert not any(name.endswith(('.ttf', '.wem')) for name in expected)
            assert len([name for name in expected if name.endswith('.woff2')]) == len(fonts['subsets'])
            for name in expected:
                assert not Path(name).is_absolute() and '..' not in Path(name).parts
                if name in build['files']:
                    data = archive.read(name)
                    assert len(data) == build['files'][name]
                    assert Path(name).stem == hashlib.sha256(data).hexdigest()[:16]
            archive.extractall(folder/'game')
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=folder))
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        results = []
        try:
            url = f'http://127.0.0.1:{server.server_port}/game/index.html'
            for name in ['web_browser', 'music_browser', 'fonts_browser']:
                run = subprocess.run([node, str(ROOT/f'tests/{name}.test.cjs')], cwd=ROOT,
                    env={**env, 'BLUEPRINT_WEB_URL':url}, capture_output=True, text=True,
                    encoding='utf-8', timeout=180)
                results.append(dict(suite=name, returncode=run.returncode, output=run.stdout+run.stderr))
                print(name, 'PASS' if run.returncode == 0 else 'FAIL', flush=True)
                if run.returncode:
                    print(run.stdout+run.stderr, flush=True)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    report = dict(version=build['version'], zipBytes=archive_path.stat().st_size,
                  zipSha256=hashlib.sha256(archive_path.read_bytes()).hexdigest(),
                  allResourceBytes=build['totalResourceBytes'], rulesId=build['rulesId'],
                  deployment='Unpacked release ZIP served at /game/index.html by a plain static HTTP server.',
                  suites=results)
    (ROOT/'reports/web_release_verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    assert all(r['returncode'] == 0 for r in results)
    print('Release ZIP verified under /game/ with no backend.')


if __name__ == '__main__':
    main()
