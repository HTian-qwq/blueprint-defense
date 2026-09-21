"""Bake the original solid-port artwork in the simulator's four flow directions."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
KIT = Path(r'F:\4\endfield_blueprint_toolkit_1.5.3')
sys.path.insert(0, str(KIT / 'code'))
from bake_blueprint_sprites import BlueprintBaker, center

def prepare():
    baker = BlueprintBaker(KIT)
    records = []
    for bid in ['unloader_1', 'loader_1', 'furnance_1', 'storager_1', 'grinder_1', 'component_mc_1', 'log_hongs_bus', 'log_hongs_bus_source']:
        for flow in range(4):
            # Source d0 flows down; runtime dir0 flows right. Keep symbols upright.
            native = (flow + 3) % 4
            closed = [('outputPorts', p['index']) for p in baker.buildings[bid]['outputPorts']] if bid == 'storager_1' else []
            img = baker.body(bid, native, formula_mode='normal', closed_ports=closed)
            center(img, baker.icon(bid))
            dest = ROOT / 'assets' / f'{bid}_flow{flow}.png'
            img.save(dest)
            records.append({'file': dest.name, 'building': bid, 'flowDirection': flow, 'nativeDirection': native,
                            'formulaMode': 'normal', 'closedPorts': closed,
                            'source': str(KIT / 'images/blueprint_source'),
                            'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
    (ROOT / 'sources/production_asset_provenance.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    return records

if __name__ == '__main__':
    print('Prepared', len(prepare()), 'directional production sprites')
