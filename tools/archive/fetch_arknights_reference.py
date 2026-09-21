"""Pin and retain a small reference from public extracted Arknights data."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPO = 'Kengxxiao/ArknightsGameData'

def get(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'BlueprintTD-local-prototype'})
    with urllib.request.urlopen(request, timeout=50) as response:
        return response.read()

commit = json.loads(get(f'https://api.github.com/repos/{REPO}/commits/master'))['sha']
sources = []
def table(path):
    url = f'https://raw.githubusercontent.com/{REPO}/{commit}/zh_CN/gamedata/{path}'
    raw = get(url)
    sources.append({'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)})
    return json.loads(raw)

characters = table('excel/character_table.json')
level = table('levels/obt/main/level_main_01-01.json')
selected = {}
for id in ['char_124_kroos', 'char_121_lava', 'char_278_orchid', 'char_210_stward']:
    row = characters[id]
    selected[id] = {'name': row['name'], 'profession': row['profession'],
                    'phase0Level1': row['phases'][0]['attributesKeyFrames'][0]['data']}
result = {'repository': f'https://github.com/{REPO}', 'commit': commit,
          'sources': sources, 'characters': selected, 'levelOptions': level['options'],
          'note': 'Extracted community data, not an official SDK. Prototype deployment costs and balance are adapted separately.'}
dest = ROOT / 'sources/arknights_reference.json'
dest.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'commit':commit,'costs':{id:r['phase0Level1']['cost'] for id,r in selected.items()},'options':level['options']},ensure_ascii=True))
