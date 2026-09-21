"""Solid-material production expansion; recipe identities and quantities come from game tables."""
BASE_RECIPES = ['furnance_crystal_shell_1', 'furnance_quartz_glass_1', 'furnance_iron_nugget_1',
                'grinder_originium_powder_1', 'component_iron_cmpt_1']
RECIPE_RESEARCH = {
    'component_glass_cmpt_1': 'components',
    'grinder_iron_powder_1': 'powder', 'grinder_quartz_powder_1': 'powder',
    'grinder_crystal_powder_1': 'powder', 'grinder_plant_moss_powder_3_1': 'powder',
    'thickener_iron_enr_powder_1': 'densification', 'thickener_originium_enr_powder_1': 'densification',
    'thickener_crystal_enr_powder_1': 'densification', 'furnance_iron_enr_1': 'densification',
    'furnance_crystal_enr_1': 'densification', 'component_iron_enr_cmpt_1': 'densification',
    'thickener_quartz_enr_powder_1': 'crystal', 'furnance_quartz_enr_1': 'crystal',
    'component_glass_enr_cmpt_1': 'crystal',
    'tools_proc_battery_1_1': 'batteries', 'tools_proc_battery_2_1': 'batteries',
    'tools_proc_battery_3_1': 'industrial',
}
PRICES = {
    # Half the initial industrial exchange rate; physical output and ammunition are unchanged.
    'item_crystal_shell':2, 'item_quartz_glass':2, 'item_iron_nugget':3,
    'item_originium_powder':2, 'item_iron_cmpt':5, 'item_glass_cmpt':3.5,
    'item_iron_powder':3, 'item_quartz_powder':2, 'item_crystal_powder':2,
    'item_plant_moss_powder_3':.5, 'item_iron_enr_powder':7, 'item_originium_enr_powder':5,
    'item_crystal_enr_powder':5, 'item_iron_enr':9, 'item_crystal_enr':7,
    'item_iron_enr_cmpt':11, 'item_quartz_enr_powder':5, 'item_quartz_enr':7,
    'item_glass_enr_cmpt':9, 'item_proc_battery_1':45, 'item_proc_battery_2':95,
    'item_proc_battery_3':225,
}
MACHINES = [
    dict(id='thickener_1',name='研磨机',kind='processor',role='双料研磨',cost=18,research='densification',color='#8ba1b2',
         desc='将矿物粉末与砂叶粉末按原版比例合批研磨。各入口可接不同物料，备齐全部原料后开始加工；缺料或出料积压会停产。'),
    dict(id='tools_assebling_mc_1',name='封装机',kind='processor',role='电池封装',cost=24,research='batteries',color='#b29f77',
         desc='将零件与源石粉末封装为谷地电池。每批按配方收齐两种材料，加工 10 秒；电池可交付兑换折金票，或入库用于研究和高级改装。'),
]

def prepare_assets():
    import hashlib, json, shutil, sys
    from pathlib import Path
    root=Path(__file__).resolve().parents[1]; kit=Path('F:/4/endfield_blueprint_toolkit_1.5.3')
    def load(name): return json.loads((kit/'tables'/f'{name}.json').read_text('utf-8'))
    crafts=load('FactoryMachineCraftTable');items=load('ItemTable');reverse=load('FactoryBuildingItemReverseTable');colors=load('RarityColorTable')
    ids={x['id'] for rid in RECIPE_RESEARCH for key in ('ingredients','outcomes') for group in crafts[rid][key] for x in group['group']}
    records=[]
    def copy(src,dest):
        shutil.copy2(src,root/'assets'/dest)
        records.append(dict(file=dest,source=str(src),sha256=hashlib.sha256(src.read_bytes()).hexdigest()))
    for id in sorted(ids): copy(kit/'images/item'/f'{items[id]["iconId"]}.png',id+'.png')
    preview_path=root/'sources/preview_assets.json';preview=json.loads(preview_path.read_text('utf-8'))
    sys.path.insert(0,str(kit/'code'))
    from bake_blueprint_sprites import BlueprintBaker,center
    baker=BlueprintBaker(kit)
    for machine in MACHINES:
        id=machine['id'];copy(kit/f'images/blueprint_baked/{id}/d0.png',id+'.png')
        for flow in range(4):
            img=baker.body(id,(flow+3)%4,formula_mode='normal');center(img,baker.icon(id));dest=root/'assets'/f'{id}_flow{flow}.png';img.save(dest)
            records.append(dict(file=dest.name,building=id,nativeDirection=(flow+3)%4,flowDirection=flow,source=str(kit/'images/blueprint_source'),sha256=hashlib.sha256(dest.read_bytes()).hexdigest()))
        item_id=reverse[id]['itemId'];item=items[item_id];file=f'portrait_{id}.png'
        copy(kit/'images/item'/f'{item["iconId"]}.png',file)
        preview['devices'][id]=dict(file=file,itemId=item_id,rarity=item['rarity'],color='#'+colors[str(item['rarity'])]['color'])
    preview_path.write_text(json.dumps(preview,ensure_ascii=False,indent=2),encoding='utf-8')
    (root/'sources/production_expansion_assets.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Prepared production expansion:',len(records),'assets')

if __name__=='__main__': prepare_assets()
