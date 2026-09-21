"""Use prepared Unicode-range fonts without requiring fontTools for normal builds."""
import base64
import hashlib
import json
from pathlib import Path


def game_characters(root):
    # Includes runtime labels, canvas text and the generated game configuration.
    text = ''.join(p.read_text('utf-8') for p in sorted((root/'src').iterdir())
                   if p.suffix in ('.html', '.js', '.json'))
    return {ord(c) for c in text if not c.isspace() or c == ' '}


def font_styles(root):
    folder = root/'assets/fonts'
    manifest = json.loads((folder/'subsets/manifest.json').read_text('utf-8'))
    faces = []
    supported = set()
    for part in manifest['subsets']:
        data = (folder/'subsets'/part['file']).read_bytes()
        if hashlib.sha256(data).hexdigest() != part['sha256']:
            raise ValueError('Font subset checksum mismatch: '+part['file'])
        supported.update(part['codepoints'])
        uri = 'data:font/woff2;base64,'+base64.b64encode(data).decode('ascii')
        faces.append('@font-face{font-family:"HarmonyOS Sans SC";src:url("'+uri+
                     '") format("woff2");font-style:normal;font-weight:40 900;'
                     'font-display:swap;unicode-range:'+part['unicodeRange']+'}')
    # A text-specific request also loads canvas glyphs, without fetching every shard.
    preload = ''.join(map(chr, sorted(game_characters(root) & supported)))
    return '\n'.join(faces), preload
