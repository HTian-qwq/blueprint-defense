"""Publish content-addressed static files alongside the portable offline build."""
import base64
import hashlib
import json
import re
import zipfile
from pathlib import Path


def build_web(root, template, style, payload, sounds, scripts, rules_id, version):
    dist = root / 'dist'
    files = {}
    def publish(content, suffix, folder='assets'):
        content = content.encode('utf-8') if isinstance(content, str) else content
        digest = hashlib.sha256(content).hexdigest()[:16]
        relative = f'{folder}/{digest}.{suffix}'
        target = dist / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.is_file():
            target.write_bytes(content)
        files[relative] = len(content)
        return './' + relative
    extensions = {'image/png':'png', 'image/webp':'webp', 'audio/mpeg':'mp3', 'font/ttf':'ttf'}
    uris = {}
    def resource(uri):
        if uri not in uris:
            mime, encoded = uri[5:].split(';base64,', 1)
            uris[uri] = publish(base64.b64decode(encoded, validate=True), extensions[mime])
        return uris[uri]
    def external(value):
        if isinstance(value, str) and value.startswith('data:') and ';base64,' in value:
            return resource(value)
        if isinstance(value, list):
            return [external(item) for item in value]
        if isinstance(value, dict):
            return {key:external(item) for key,item in value.items()}
        return value
    web_data, web_sounds = external(payload), external(sounds)
    style = re.sub(r'data:[\w.+/-]+;base64,[A-Za-z0-9+/=]+', lambda match:resource(match.group()), style)
    # CSS lives one directory below index.html; its asset URLs are CSS-relative.
    style = style.replace('./assets/', '../assets/')
    css = publish(style, 'css', 'styles')
    data = publish(json.dumps(web_data, ensure_ascii=False, separators=(',',':')), 'json', 'data')
    audio = publish(json.dumps(web_sounds, separators=(',',':')), 'json', 'data')
    script = publish('const DATA=globalThis.BlueprintPayload;const SOUNDS=globalThis.BlueprintSounds;\n'+scripts, 'js', 'scripts')
    options = dict(version=version,rulesId=rules_id,data=data,sounds=audio,script=script)
    boot = publish((root/'src/web_boot.js').read_text('utf-8').replace('__WEB_OPTIONS__', json.dumps(options)), 'js', 'scripts')
    html = template.split('<script>const DATA=',1)[0]
    html = html.replace('<style>__STYLE__</style>', f'<link rel="stylesheet" href="{css}">')
    html = html.replace('class="loading-screen" hidden', 'class="loading-screen"')
    html += f'<script defer src="{boot}"></script></body></html>\n'
    for name in ('index.html','blueprint_defense.html'):
        (dist/name).write_text(html,encoding='utf-8',newline='\n')
    (dist/'_headers').write_text('/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/styles/*\n  Cache-Control: public, max-age=31536000, immutable\n/scripts/*\n  Cache-Control: public, max-age=31536000, immutable\n/data/*\n  Cache-Control: public, max-age=31536000, immutable\n/\n  Cache-Control: no-cache\n/*.html\n  Cache-Control: no-cache\n',encoding='utf-8',newline='\n')
    report = dict(version=version,rulesId=rules_id,entryBytes=len(html.encode('utf-8')),files=files,totalResourceBytes=sum(files.values()))
    (root/'reports').mkdir(exist_ok=True)
    (root/'reports/web_build.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    with zipfile.ZipFile(dist/'blueprint-defense-web.zip','w',compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in ['index.html','blueprint_defense.html','_headers',*sorted(files)]:
            archive.write(dist/relative,relative)
    print(f'Web entry: {report["entryBytes"]/1024:.1f} KiB; {len(files)} cached resource files')
