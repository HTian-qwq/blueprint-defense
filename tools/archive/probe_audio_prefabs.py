"""Locate tower effect prefabs that carry their own Wwise event bindings."""
import importlib.util
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
KIT=Path('F:/4/endfield_blueprint_toolkit_1.5.3')
sys.path.insert(0,'F:/4/wuling/pylibs')
spec=importlib.util.spec_from_file_location('manifest_reader',Path('F:/4/endfield_research_kit_json/scripts/inspect_manifest_hgmmap.py'))
mod=importlib.util.module_from_spec(spec);sys.modules[spec.name]=mod;spec.loader.exec_module(mod)
manifest=mod.parse_manifest(KIT/'research/takeover_20260919/live_manifest/Data/Bundles/Windows/manifest.hgmmap')
assets,_=mod.parse_asset_rows(manifest);bundles,_=mod.parse_bundle_rows(manifest)
hits=[]
for row in assets:
    path=mod.decode_asset_path(manifest,row)
    if not path.endswith('.prefab'):continue
    if any(x in path for x in ('corrosiontower','spitfiretower','cannontower','p_agcanno_skill_hit')):
        hits.append({'path':path,'bundle':mod.decode_bundle_name(manifest,bundles[row.bundle_index])})
dest=ROOT/'sources/audio/effect_prefabs';dest.mkdir(exist_ok=True)
(dest/'asset_candidates.json').write_text(json.dumps(hits,indent=2),encoding='utf-8')
(dest/'bundle_request.json').write_text(json.dumps({'bundles':sorted({h['bundle'] for h in hits})}),encoding='utf-8')
print(json.dumps(hits,indent=2))
