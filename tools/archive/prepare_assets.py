"""Copy only needed original sprites; keep this experiment separate from the editor."""
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
KIT = Path(r'F:\4\endfield_blueprint_toolkit_1.5.3')
sys.path.insert(0, str(KIT / 'code'))
from export_blueprint_sprites import Catalog

towers = ['battle_turret_1', 'battle_cannon_1', 'battle_frost_1', 'battle_laser_1',
          'battle_lightning_1', 'battle_sniper_1', 'battle_debuff_1', 'battle_trap_1', 'battle_rocket_1',
          'battle_turret_2', 'battle_turret_3', 'battle_cannon_2', 'battle_laser_2', 'battle_lightning_2',
          'unloader_1','loader_1','log_hongs_bus','log_hongs_bus_source','furnance_1','storager_1','grinder_1','component_mc_1','sp_hub_1']
enemies = ['eny_0029_lbmob', 'eny_0059_erhound', 'eny_0021_agmelee', 'eny_0018_lbtough',
           'eny_0076_agfly', 'eny_0074_lbshield', 'eny_0060_lbmad', 'eny_0077_agshield',
           'eny_0033_lbhunt', 'eny_0046_lbshamman', 'eny_0049_rogue', 'eny_0092_slbomb', 'eny_0051_rodin',
           'eny_0027_agscorp', 'eny_0055_hscrane', 'eny_0108_slbomb2']
assets = ROOT / 'assets'
assets.mkdir(exist_ok=True)
records = []
for id in ['icon_belt_grid', 'icon_belt_corner_1', 'icon_belt_corner_2']:
    source = KIT / f'images/blueprint_source/blueprint/{id}.png'
    shutil.copy2(source, assets / (id + '.png'))
    records.append({'file': id + '.png', 'source': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
for id in towers:
    source = KIT / f'images/blueprint_baked/{id}/d0.png'
    shutil.copy2(source, assets / (id + '.png'))
    records.append({'file': id + '.png', 'source': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()})
catalog = Catalog([ROOT / 'sources/enemy_icons'])
for id in ['item_originium_ore','item_quartz_sand','item_iron_ore','item_crystal_shell','item_quartz_glass','item_iron_nugget','item_originium_powder','item_iron_cmpt']:
    source=KIT / 'images/item' / (id+'.png')
    shutil.copy2(source,assets/(id+'.png'))
    records.append({'file':id+'.png','source':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
for id in enemies:
    source, row = next((s,r) for s,r in catalog.paths.items() if r['name'] == id and '/monstericon/' in s)
    image, meta = catalog.sprite(row)
    dest = assets / (id + '.png')
    image.save(dest)
    records.append({'file': dest.name, 'source': source, 'objectId': row['id'], 'size': image.size, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
(ROOT / 'sources/asset_provenance.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
print('Prepared', len(records), 'original assets')
from prepare_production_assets import prepare
print('Prepared', len(prepare()), 'directional production sprites')
from production_config import prepare_assets as prepare_industrial
prepare_industrial()
from prepare_preview_assets import prepare
print('Prepared', len(prepare()), 'original UI portraits')
