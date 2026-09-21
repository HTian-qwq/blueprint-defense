"""Copy the original inventory portraits and blueprint cover into the standalone demo."""
import hashlib
import json
from pathlib import Path
import shutil

ROOT=Path(__file__).resolve().parents[1]
KIT=Path(r'F:\4\endfield_blueprint_toolkit_1.5.3')

def prepare():
    def table(name):return json.loads((KIT/'tables'/f'{name}.json').read_text('utf-8'))
    reverse,items,colors=table('FactoryBuildingItemReverseTable'),table('ItemTable'),table('RarityColorTable')
    config=json.loads((ROOT/'src/data.json').read_text('utf-8'))
    ids={p['id'] for p in config['production']['types']}|{'battle_rocket_1','sp_hub_1'}
    for tower in config['towers']:
        ids.add(tower.get('artId',tower['id']));ids.update(v.get('artId',v['id']) for v in tower['upgrades'])
    result={};records=[]
    def copy(source,name):
        dest=ROOT/'assets'/name;shutil.copy2(source,dest)
        records.append({'file':name,'source':str(source),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
    for bid in sorted(ids):
        item_id='item_log_belt_01' if bid=='icon_belt_grid' else reverse[bid]['itemId']
        item=items[item_id];source=KIT/'images/item'/f'{item["iconId"]}.png'
        copy(source,f'portrait_{bid}.png')
        result[bid]={'file':f'portrait_{bid}.png','itemId':item_id,'rarity':item['rarity'],'color':'#'+colors[str(item['rarity'])]['color']}
    copy(KIT/'images/blueprint_presentation/icon_fac_blueprint_bg_blue.png','ui_blueprint_cover.png')
    decorations={'contours':'deco_btn_contour_lines.png','technicalLabel':'deco_fac_blueprint_16.png','cardBase':'bg_item_small_black.png','cardDots':'deco_item_dot.png','sizeMark':'deco_fac_blueprint_size.png'}
    for key,file in decorations.items():copy(KIT/'images/blueprint_presentation'/file,f'ui_{key}.png')
    (ROOT/'sources/preview_assets.json').write_text(json.dumps({'devices':result,'decorations':{key:f'ui_{key}.png' for key in decorations},'files':records},ensure_ascii=False,indent=2),encoding='utf-8')
    return result

if __name__=='__main__':print('Prepared',len(prepare()),'original device portraits and blueprint cover')
