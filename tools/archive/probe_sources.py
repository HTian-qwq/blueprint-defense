import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
KIT = Path(r'F:\4\endfield_blueprint_toolkit_1.5.3')
sys.path.insert(0, r'F:\4\wuling\pylibs')
path = Path(r'F:\4\endfield_research_kit_json\scripts\inspect_manifest_hgmmap.py')
spec = importlib.util.spec_from_file_location('manifest_reader', path)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)
manifest = mod.parse_manifest(KIT / 'research/takeover_20260919/live_manifest/Data/Bundles/Windows/manifest.hgmmap')
assets, _ = mod.parse_asset_rows(manifest)
bundles, _ = mod.parse_bundle_rows(manifest)
hits = []
for row in assets:
    source = mod.decode_asset_path(manifest, row)
    if '/ui/' in source and (any(x in source for x in ('enemy', 'monster', 'eny_', 'lbtough', 'lbmelee', 'erhound'))):
        hits.append({'path': source, 'bundle': mod.decode_bundle_name(manifest, bundles[row.bundle_index])})
(ROOT / 'sources').mkdir(parents=True, exist_ok=True)
(ROOT / 'sources/enemy_asset_candidates.json').write_text(json.dumps(hits, indent=2), encoding='utf-8')
print(json.dumps(hits[:55], ensure_ascii=False, indent=2))
print('matches', len(hits))
