"""Build a portable offline demo with embedded original artwork and explicit balance."""
import base64
from html import escape
import hashlib
import json
import re
from economy_config import configure
from production_config import BASE_RECIPES, RECIPE_RESEARCH, PRICES, MACHINES
from pathlib import Path
from web_build import build_web

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT / 'sources/game_data'
def load(path):
    return json.loads(path.read_text('utf-8'))

cn = load(KIT / 'tables/I18nTextTable_CN.json')
buildings = load(KIT / 'tables/FactoryBuildingTable.json')
battle = load(ROOT / 'sources/tables/FactoryBattleTable.json')
enemy_names = load(ROOT / 'sources/tables/EnemyTemplateDisplayInfoTable.json')
enemy_attrs = load(ROOT / 'sources/tables/EnemyAttributeTemplateTable.json')
enemy_abilities = load(ROOT / 'sources/enemy_abilities/EnemyAbilityDescTable.json')
ark = load(ROOT / 'sources/arknights_reference.json')
audio_profiles = load(ROOT / 'assets/audio/profiles.json')
attack_audit = load(ROOT / 'sources/attack_pattern_audit.json')['towers']
def name(ref):
    return cn[str(ref['name']['id'])]
def art(id):
    return 'data:image/png;base64,' + base64.b64encode((ROOT / 'assets' / (id + '.png')).read_bytes()).decode()

specs = [
    ('battle_turret_1', 'char_124_kroos', '速射', 'single', 76, '#bf8836', '每轮快速连射 4 发，约 0.23 秒完成命中；每 2 秒开始下一轮。'),
    ('battle_cannon_1', 'char_121_lava', '群攻', 'splash', 210, '#d47555', '炮弹在目标周围爆炸，处理密集敌群。'),
    ('battle_frost_1', 'char_278_orchid', '控制', 'slow', 55, '#58a8b9', '液氮晶体爆裂，使范围内敌人减速 60%，持续 3 秒。'),
    ('battle_laser_1', 'char_210_stward', '贯穿', 'pierce', 340, '#8c7ebb', '电磁射线无视护甲，贯穿射线上最多 3 个目标。'),
    ('battle_lightning_1', None, '弹射', 'chain', 155, '#779cda', '电弧至多弹射 2 次，每次伤害衰减 20%，无视护甲，可攻击飞行敌人。'),
    ('battle_sniper_1', None, '远程', 'snipe', 380, '#c5ad74', '优先锁定高威胁目标。远距离重击，适合处理护盾与首领。'),
    ('battle_debuff_1', None, '破甲', 'acid', 95, '#90b86d', '酸液弹对地面群体造成伤害，使护甲降低 65%，持续 6 秒；不叠加。'),
    ('battle_trap_1', None, '灼烧', 'flame', 82, '#db8252', '近距离喷出火焰，留下持续 3 秒的燃烧区，每秒造成灼热伤害。只能攻击地面目标。')
]
fan_costs={'battle_lightning_1':22,'battle_sniper_1':24,'battle_debuff_1':18,'battle_trap_1':20}
upgrade_effects={
    'battle_turret_2':{'desc':'每轮快速连射 4 发，约 0.37 秒完成命中；第 4 发是强化弹，占整轮伤害 40%，为普通弹的 2 倍。'},
    'battle_turret_3':{'desc':'每轮快速连射 6 发，约 0.43 秒完成命中；末发范围强化弹占整轮伤害 40%，前五发各占 12%。每 2 秒开始下一轮。'},
    'battle_cannon_2':{'burnDps':60,'desc':'榴弹爆炸后留下持续 3 秒的燃烧区，每秒造成 60 点灼热伤害。只攻击地面目标。'},
    'battle_laser_2':{'highThreat':True,'desc':'优先锁定高威胁目标，强力电磁射线无视护甲，贯穿最多 3 个目标。'},
    'battle_lightning_2':{'orbDps':45,'desc':'电弧至多弹射 2 次，并留下持续 3 秒的电球，每秒对附近目标造成 45 点电磁伤害。'}
}
upgrade_evidence=[]
towers = []
for id, ref, role, mode, damage, color, desc in specs:
    b = battle[id]
    cost = ark['characters'][ref]['phase0Level1']['cost'] if ref else fan_costs[id]
    family=id.rsplit('_',1)[0]
    family_ids=sorted([key for key in battle if re.fullmatch(re.escape(family)+r'_\d+',key)],key=lambda key:int(key.rsplit('_',1)[1]))
    variants=family_ids[1:] if len(family_ids)>1 else [id,id]
    upgrades=[]
    for stage,variant in enumerate(variants,2):
        v=battle[variant]
        upgrades.append(dict(id=variant,name=name(buildings[variant]),image=art(variant),audio=audio_profiles[variant],burst=attack_audit[variant].get('burst'),
                             damage=round(damage*1.55**(stage-1)),range=v['attackRange']/4+.3*(stage-1),
                             interval=v['chargeInterval'],upgradeKind='refit' if variant!=id else 'enhance',
                             **upgrade_effects.get(variant,{})))
    if len(family_ids)>1:
        upgrade_evidence.append({'family':family,'relation':'Series inferred from numbered IDs and tier-specific descriptions; independent recipes, not an explicit nextBuildingId field.',
            'stages':[{'id':key,'name':name(buildings[key]),'skill':battle[key]['commonSkillId'],
                       'description':cn.get(str(battle[key]['normalDesc']['id']),''),
                       'buildingItem':load(KIT/'tables/FactoryBuildingItemReverseTable.json').get(key),
                       'recipe':load(KIT/'tables/FactoryHubCraftTable.json').get(key)} for key in family_ids]})
    towers.append(dict(id=id, name=name(buildings[id]), role=role, mode=mode, damage=damage,upgrades=upgrades,audio=audio_profiles[id],burst=attack_audit[id].get('burst'),
                       color=color, desc=desc, cost=cost, range=b['attackRange']/4, interval=b['chargeInterval'], image=art(id),
                       targets='ground' if mode in ('splash','slow','acid','flame') else 'all',
                       reference={'rangeMeters': b['attackRange'], 'chargeInterval': b['chargeInterval'],
                                  'skill': b['commonSkillId'], 'costCharacter': ref,'costSource':'Arknights reference' if ref else 'fan balance',
                                  'originalDescription':cn.get(str(b['normalDesc']['id']), '')}))
# Original mortar plus an explicitly fictional, user-requested overpowered refit.
mortar=battle['battle_rocket_1']
towers.append(dict(id='battle_rocket_1',name=name(buildings['battle_rocket_1']),role='重炮',mode='mortar',
    damage=1400,cost=32,color='#a78b53',range=mortar['attackRange']/4,interval=mortar['chargeInterval'],
    splashRadius=2,duration=1.25,targets='ground',image=art('battle_rocket_1'),audio=audio_profiles['battle_rocket_1'],
    desc='每 8 秒发射一枚高抛重炮弹，对落点半径 2 格内的地面敌人造成 1400 点物理伤害。射程 6.25 格，炮弹飞行时间 1.25 秒。',
    upgrades=[dict(id='battle_rocket_wisadel',artId='battle_rocket_1',name='维什戴尔改件',role='重锤迫击炮 · 改装',
        damage=33000,range=7,interval=8,splashRadius=2.8,duration=1.25,cost=64,upgradeKind='refit',easterEgg=True,
        color='#ae4d68',image=art('wisadel_portrait'),audio={**audio_profiles['battle_rocket_1'],'deploy':'wisadel.deploy','voice':'wisadel.attack'},
        desc='每 8 秒发射一枚高抛重炮弹，对落点半径 2.8 格内的地面敌人造成 33000 点物理伤害。射程 7 格，炮弹飞行时间 1.25 秒。')],
    reference={'rangeMeters':mortar['attackRange'],'chargeInterval':mortar['chargeInterval'],'skill':mortar['commonSkillId'],
        'originalDescription':cn[str(mortar['normalDesc']['id'])],'costSource':'fan balance',
        'adaptation':'8-second cadence and original mortar artwork retained. Base damage, splash size, travel time, cost and the Wisadel easter-egg refit are fan design; voice recordings supplied by the user.'}))

footprint_evidence={}
for tower in towers:
    for form in [tower,*tower['upgrades']]:
        bid=form.get('artId',form['id']);r=buildings[bid]['range']
        form['footprint']={'width':r['width'],'depth':r['depth']}
        footprint_evidence[bid]={'originalRange':r,'footprint':form['footprint']}
(ROOT/'sources/tower_footprint_reference.json').write_text(json.dumps({'source':(KIT/'tables/FactoryBuildingTable.json').relative_to(ROOT).as_posix(),'units':'One blueprint grid cell per original width/depth unit. Height is vertical and is not a footprint dimension.','buildings':footprint_evidence},ensure_ascii=False,indent=2),encoding='utf-8')

enemy_specs = [('eny_0029_lbmob','突入',.82,12,1), ('eny_0059_erhound','疾行',1.32,4,1),
               ('eny_0021_agmelee','集群',.94,6,1), ('eny_0018_lbtough','重装',.50,42,3),
               ('eny_0076_agfly','飞行',1.12,4,1), ('eny_0074_lbshield','护盾',.68,50,2),
               ('eny_0060_lbmad','狂奔',1.03,9,1), ('eny_0077_agshield','精英',.43,85,4),
               ('eny_0033_lbhunt','压制',.75,12,1), ('eny_0046_lbshamman','闪现',.53,22,2),
               ('eny_0049_rogue','闪避',1.08,8,1), ('eny_0092_slbomb','治疗',.87,6,1),
               ('eny_0051_rodin','BOSS',.40,105,10),
               ('eny_0027_agscorp','召唤',.58,25,2), ('eny_0055_hscrane','支援',.70,16,2),
               ('eny_0108_slbomb2','爆破',1.02,8,1)]
enemy_traits={
    'eny_0029_lbmob':{'threat':1,'desc':'标准地面敌人。'},
    'eny_0059_erhound':{'threat':2,'desc':'移动较快，适合用减速配合击杀。'},
    'eny_0021_agmelee':{'threat':1,'desc':'生命较低，常成群出现。'},
    'eny_0018_lbtough':{'threat':4,'desc':'高生命与护甲，漏过扣 3 点耐久。'},
    'eny_0076_agfly':{'threat':3,'flying':True,'desc':'沿传送带上空前进；榴弹、液氮、酸液和燃烧区无法命中。'},
    'eny_0074_lbshield':{'threat':6,'shield':180,'badge':'盾','ward':{'radius':2.3,'fraction':.08,'capFraction':.16,'targets':3,'interval':7,'windup':.8},'desc':'同人护盾支援：蓄力 0.8 秒，为附近最多 3 名同伴补充 8% 最大生命的护盾，上限至少为 16%；每 7 秒发动。优先击杀护盾兵，或用高威胁优先的塔拆掉支援队。'},
    'eny_0060_lbmad':{'threat':3,'rageSpeed':1.65,'desc':'生命低于一半时移动速度提高 65%。'},
    'eny_0077_agshield':{'threat':6,'shield':350,'slowResistance':.5,'desc':'高护甲精英，携带护盾；减速效果减半，漏过扣 4 点耐久。'},
    'eny_0033_lbhunt':{'threat':4,'suppress':{'range':3,'interval':7,'windup':.8,'duration':1.4},'desc':'每 7 秒瞄准附近一台设备；红线预警 0.8 秒后使其停火 1.4 秒。优先清理可减少火力空档。'},
    'eny_0046_lbshamman':{'threat':5,'blink':{'distance':1.4,'cooldown':7},'desc':'受到伤害时沿传送带向前闪现 1.4 格，冷却 7 秒。用集中火力击杀，避免被持续消耗攻击反复触发闪现。'},
    'eny_0049_rogue':{'threat':3,'dodgeCooldown':3.5,'desc':'闪避一次设备伤害，冷却 3.5 秒。密集连射和持续伤害能够消耗闪避后继续命中。'},
    'eny_0092_slbomb':{'threat':4,'deathHeal':{'radius':2.2,'fraction':.15},'desc':'死亡时回复 2.2 格内存活同伴 15% 最大生命，含罗丹。治疗不会超过最大生命。'},
    'eny_0027_agscorp':{'threat':8,'badge':'召','summon':{'type':2,'count':2,'limit':2,'interval':8,'windup':1.2,'hpScale':.85},'desc':'同人召唤：预警 1.2 秒后在身边召来 2 名轻型援兵，最多召唤 2 次，间隔 8 秒。援兵计入总数；在蓄力结束前击杀召唤者可阻止本次召唤。哨戒塔或高能射线优先处理高威胁目标。'},
    'eny_0055_hscrane':{'threat':9,'badge':'疗','heal':{'radius':2.6,'fraction':.08,'targets':3,'interval':6,'windup':1},'desc':'同人治疗支援：绿色圈预警 1 秒后，回复附近最多 3 名受伤同伴 8% 最大生命，每 6 秒发动。可治疗罗丹，不能复活或治疗自身；优先击杀治疗者可打断读条。'},
    'eny_0108_slbomb2':{'threat':4,'badge':'爆','deathBurst':{'radius':2.2,'windup':1.3,'duration':2.2},'desc':'同人死亡爆破：击杀后留下橙色预警圈，1.3 秒后使圈内防御塔停火 2.2 秒。优先远距离击杀、分散炮塔，避免爆破和压制接力封锁同一区域。'},
    'eny_0051_rodin':{'threat':10,'boss':True,'slowResistance':.65,
        'audio':{key:'rodin.'+key for key in ('charge','slam','flameCharge','flame')},
        'phaseShieldFraction':.25,'phaseSpeed':1.2,
        'bossAttack':{'interval':9,'windup':1.2,'radius':2.5,'duration':2,
                      'phase2Interval':6,'phase2Windup':1,'phase2Radius':3,'phase2Duration':2.6},
        'desc':'第一阶段蓄力施放牵引震击，使预警范围内设备停火 2 秒。半血时吸能进入第二阶段，获得 25% 最大生命的护盾并加速；火焰冲击扩大到 3 格，使设备停火 2.6 秒。漏过直接损失 10 点耐久。阶段与停火规则为同人适配。'}
}
enemies = []
for id, role, speed, armor, leak in enemy_specs:
    original = {str(a['attrType']):a['attrValue'] for a in enemy_attrs[id]['levelDependentAttributes'][0]['attrs']}
    ability_ids=enemy_names[id]['abilityDescIds']
    if id in ('eny_0046_lbshamman','eny_0049_rogue','eny_0092_slbomb'):ability_ids=[id+'_settlement_ability_1']
    enemies.append(dict(id=id,name=name(enemy_names[id]),role=role,hp=original['1'],speed=speed,armor=armor,leak=leak,image=art(id),**enemy_traits[id],reference={'level':1,'attributes':original,'traits':'fan adaptation',
        'originalDescription':cn.get(str(enemy_names[id]['description']['id']),''),
        'abilities':[{'id':key,'description':cn.get(str(enemy_abilities[key]['description']['id']),'')} for key in ability_ids if key in enemy_abilities]}))
waves = [
    {'name':'前哨接敌', 'enemies':[0,0,0,2,0,2,0,0,2,0,2,0], 'gap':1.7, 'hp':1},
    {'name':'高速穿插', 'enemies':[1,0,1,1,2,0,1,2,1,0,2,1,0,1,2,1], 'gap':1.2, 'hp':1.08},
    {'name':'密集攻势', 'enemies':[2,2,0,2,2,1,2,0,2,2,1,2,2,0,2,2,1,2,0,2,2,1], 'gap':.8, 'hp':1.2},
    {'name':'低空突入', 'enemies':[0,4,3,1,2,4,1,3,2,0,1,4,0,2,4,1,3,0,2,4,1,2,0,4], 'gap':1, 'hp':1.3},
    {'name':'盾阵推进', 'enemies':[1,5,0,3,2,5,1,0,3,4,2,3,0,2,5,1,3,0,2,4,1,5,0,2,3,1,0,2], 'gap':.9, 'hp':1.5},
    {'name':'雾火狂袭', 'enemies':[6,4,6,5,2,6,1,4,5,6,2,6,4,6,2,0,6,4,1,2,6,5,0,2,6,4,1,6,2,0], 'gap':.7, 'hp':1.6},
    {'name':'晶城压境', 'enemies':[5,4,3,6,7,2,5,4,6,3,5,4,6,2,0,2,3,6,4,5,2,0,6,3,4,2,5,6,0,2,3,4], 'gap':.85, 'hp':1.65},
    {'name':'终局合围', 'enemies':[4,6,5,3,4,7,6,5,2,4,6,3,5,7,4,6,5,6,2,0,4,6,3,2,5,6,4,0,2,3,6,4,2,0], 'gap':.7, 'hp':1.8},
    {'name':'碾骨先遣队', 'enemies':[10,8,11,9,5,10,8,11,6,9,10,8,4,11,9,10,2,0,8,6,10,2,9,4,0,8,6,10,2,5,0,2], 'gap':.85, 'hp':1.9},
    {'name':'碾骨之拳 · 罗丹', 'enemies':[8,10,5,0,2,11,12,9,8,10,2,0,11,6,5,8,10,2,9,0,11,6], 'gap':1.1, 'hp':2}
]
# Later waves combine support units with existing elites, instead of only
# stretching the duration of the old queues. Rodin remains unique.
pressure_packs = {
    0:[0,0,2,0,2,0],
    1:[1,0,1,2,0,1,2],
    2:[2,2,0,2,1,2,0,2],
    3:[0,4,3,1,2,4,5,1,3,2,0,4,14,2,4],
    4:[5,0,3,2,14,5,1,3,15,2,0,8,5,4],
    5:[6,4,5,13,2,6,14,1,4,15,6,8,2,5,6,4],
    6:[5,7,14,4,3,13,6,15,8,2,5,9,6,4],
    7:[4,6,5,15,7,14,6,8,13,4,9,10,5,2,6],
    8:[10,8,5,14,11,9,13,6,15,10,8,4,7,2,5],
    9:[5,14,8,10,13,15,11,9,7,2,6,4,8,5,10,2,14,15]
}
pressure_counts=[18,28,40,54,68,82,94,104,112,120]
pressure_gaps=[1.1,.9,.7,.6,.5,.43,.38,.34,.32,.32]
pressure_hp=[1.05,1.12,1.25,1.4,1.6,1.75,1.85,2,2.2,2.6]
for i,pack in pressure_packs.items():
    waves[i]['enemies']=[pack[n%len(pack)] for n in range(pressure_counts[i])]
    waves[i]['gap']=pressure_gaps[i];waves[i]['hp']=pressure_hp[i]
waves[-1]['enemies'][42]=12
crafts=load(KIT/'tables/FactoryMachineCraftTable.json')
craft_groups=load(KIT/'tables/FactoryMachineCraftGroupTable.json')
item_table=load(KIT/'tables/ItemTable.json')
recipe_ids=BASE_RECIPES+list(RECIPE_RESEARCH)
recipes=[]
for rid in recipe_ids:
    r=crafts[rid]
    inputs=[x for group in r['ingredients'] for x in group['group']]
    outputs=[x for group in r['outcomes'] for x in group['group']]
    assert len(outputs)==1 and all(x['count']>0 for x in inputs+outputs)
    recipes.append({'id':rid,'machineId':r['machineId'],'input':inputs[0]['id'],'output':outputs[0]['id'],'inputCount':inputs[0]['count'],'outputCount':outputs[0]['count'],
                    'inputs':[{k:x[k] for k in ('id','count')} for x in inputs], 'research':RECIPE_RESEARCH.get(rid),
                    'period':r['progressRound']*craft_groups[r['formulaGroupId']]['msPerRound']/1000})
item_ids=sorted({x['id'] for r in recipes for x in r['inputs']}|{r['output'] for r in recipes})
prices=PRICES
production_unlocks=[{'id':'blue_iron','name':'蓝铁矿','research':'blue_iron','items':['item_iron_ore','item_iron_nugget','item_iron_cmpt']}]
production_items={id:{'id':id,'name':name(item_table[id]),'image':art(id),'value':prices.get(id,0)} for id in item_ids}
for recipe in recipes:
    if recipe['research']: production_items[recipe['output']]['research']=recipe['research']
production_items['item_plant_moss_3']['research']='powder'
for rule in production_unlocks:
    for item in rule['items']: production_items[item]['research']=rule['research']
raw_materials=[id for id in item_ids if id not in {r['output'] for r in recipes}]
production_types=[
    {'id':'unloader_1','name':'仓库取货口','kind':'unloader','category':'warehouse','role':'取货','cost':2,'period':3,'sources':['item_originium_ore']+[id for id in item_ids if id!='item_originium_ore'],'color':'#c9a159','desc':'仓库接口朝下接入地图底部存取线，每 3 秒取出一份选定物品。源矿、紫晶矿无限供应；蓝铁矿需要研究蓝铁冶炼解锁，解锁后无限供应。成品需要先存入仓库。按箭头输出。'},
    {'id':'icon_belt_grid','name':'生产传送带','kind':'belt','role':'输送','cost':1,'period':.35,'color':'#baa64f','desc':'按住拖拽连续铺设，松开确认；自动转弯，末端可自动对准设备入口。按 R 锁定末端方向，Esc 取消。已有传送带可复用，按新建格数收费。'},
    {'id':'furnance_1','name':'精炼炉','kind':'processor','role':'精炼','cost':5,'color':'#bf855f','desc':'将矿石或研磨后的粉末精炼为外壳、纤维、金属块。基础配方初始可用；致密冶炼与高晶精炼解锁更高级材料。'},
    {'id':'storager_1','name':'协议储存箱','kind':'supply','role':'供给 / 折金票','cost':4,'period':.5,'color':'#7fabab','desc':'交付成品兑换折金票，或存入仓库用于研究和补给。原矿不能兑换，费用不足以容纳整份收益时暂存。兑换为同人规则。'},
    {'id':'grinder_1','name':'粉碎机','kind':'processor','role':'粉碎','cost':5,'color':'#90a16c','desc':'将源矿加工为源石粉末。研究粉体工艺后可粉碎蓝铁块、紫晶纤维、晶体外壳和砂叶；砂叶每份产出 3 份粉末。'},
    {'id':'component_mc_1','name':'配件机','kind':'processor','role':'深加工','cost':7,'color':'#8aa0b8','desc':'将金属块或纤维加工为零件。铁制零件用于武器与中容电池，紫晶零件用于电池与高晶研究；钢制和高晶零件用于高级研究和改装。'},
    {'id':'log_hongs_bus_source','name':'仓库存取线源桩','kind':'hub','builtIn':True,'category':'warehouse','role':'自带仓库','cost':0,'color':'#91a6a8','desc':'地图底部自带仓库起点，不需要建造。整排存取线共享仓库，原材料无限供应，成品按实际库存取用。'},
    {'id':'log_hongs_bus','name':'仓库存取线基段','kind':'bus','builtIn':True,'category':'warehouse','role':'自带管线','cost':0,'color':'#8b9d86','desc':'地图底部自带的仓库存取线基段，不需要建造。在上方贴放存取口，仓库接口朝下即可使用公共仓库。'},
    {'id':'loader_1','name':'仓库存货口','kind':'loader','category':'warehouse','role':'入库','cost':2,'period':.5,'color':'#a3a16d','desc':'仓库接口朝下连接底部存取线，从上方物品入口接收物品并存入公共仓库。入库不直接兑换折金票；成品可以从任一在线取货口取出。'}]
production_types.extend(dict(machine) for machine in MACHINES)
port_references={}
for p in production_types:
    p['image']=art(p['id'])
    p['defaultDir']=3 if p['kind']=='unloader' else 1 if p['kind']=='loader' else 0
    if p['kind']=='belt':
        p['footprint']={'width':1,'depth':1}
        p['ports']={'inputs':[1,2,3],'outputs':[0],'warehouse':None}
    elif p.get('builtIn'):
        p['ports']={'inputs':[],'outputs':[],'warehouse':None}
    else:
        b=buildings[p['id']]
        # Original port rotation is clockwise from top. Input faces point inward.
        def faces(field):
            return sorted({(port['trans']['rotation']['y']//90+(2 if field=='inputPorts' else 0)+2)%4
                           for port in b[field] if not port['isPipe']})
        p['ports']={'inputs':faces('inputPorts'),'outputs':faces('outputPorts') if p['kind']!='supply' else [],
                    'warehouse':(b['roadAttachSide']+2)%4 if p['kind'] in ('unloader','loader') else None}
        p['faces']=[art(p['id']+f'_flow{direction}') for direction in range(4)]
        p['image']=p['faces'][0]
        port_references[p['id']]={key:b[key] for key in ['range','inputPorts','outputPorts','roadAttachSide'] if key in b}
        port_references[p['id']]['runtimePorts']=p['ports']
        p['desc']+=' '+({'unloader':'仓库接口须朝下、出货口朝上。','loader':'物品入口须朝上、仓库接口朝下。','supply':'只从标出的入口进料；供给站不再向外出货。'}.get(p['kind'],'物品只从入口进入，由另一侧出口送出；R 同时旋转两个接口。'))
    if p['kind']!='belt':
        b=buildings[p['id']];w,d=b['range']['width'],b['range']['depth']
        # Runtime dir0 uses native d3; rotate artwork and cell coordinates together.
        p['footprint']={'width':d,'depth':w}
        p['faces']=[art(p['id']+f'_flow{direction}') for direction in range(4)]
        p['image']=p['faces'][0]
        p['portCells']={}
        for field,key in [('inputPorts','inputs'),('outputPorts','outputs')]:
            ports=[]
            for port in b[field]:
                if port['isPipe'] or p['kind']=='supply' and key=='outputs':continue
                pos=port['trans']['position']
                ports.append({'x':d-1-pos['z'],'y':w-1-pos['x'],'side':(port['trans']['rotation']['y']//90+(2 if key=='inputs' else 0)+2)%4,'index':port['index']})
            p['portCells'][key]=ports
        footprint_evidence[p['id']]={'originalRange':b['range'],'runtimeDir0Footprint':p['footprint'],'portCells':p['portCells']}
production_port_reference={'buildings':port_references,'directionConvention':'Runtime 0=right, 1=down, 2=left, 3=up; original solid-port flow is down, so native sprite rotation=(runtime direction+3)%4.',
                          'adaptation':'Every original solid port retains its own grid cell and rotates with its full-size building. Belts accept rear or side input but reject head-on input. Supply settles each item for either DP or stock and has no output; its output artwork is hidden. Unused liquid ports are hidden in normal formula mode.'}
(ROOT/'sources/production_ports_reference.json').write_text(json.dumps(production_port_reference,ensure_ascii=False,indent=2),encoding='utf-8')
production={'types':production_types,'recipes':recipes,'items':production_items,'rawMaterials':raw_materials,'unlocks':production_unlocks}
(ROOT/'sources/production_reference.json').write_text(json.dumps({'unlocks':production_unlocks,'dpPrices':prices,'recipes':{rid:crafts[rid] for rid in recipe_ids},'groups':{crafts[rid]['formulaGroupId']:craft_groups[crafts[rid]['formulaGroupId']] for rid in recipe_ids},'warehouseBuildings':{p['id']:{'name':name(buildings[p['id']]),'description':cn[str(buildings[p['id']]['desc']['id'])]} for p in production_types if p.get('category')=='warehouse'},'timeFormula':'FactoryUtils.lua:42: progressRound * machineCraftGroupData.msPerRound * 0.001','source':(KIT/'tables').relative_to(ROOT).as_posix(),'sourceHashes':{file:hashlib.sha256((KIT/'tables'/file).read_bytes()).hexdigest() for file in ['FactoryMachineCraftTable.json','FactoryMachineCraftGroupTable.json','FactoryBuildingTable.json','ItemTable.json']},'adaptation':'Infinite raw warehouse supply is user-requested. Blue iron and its recipes require the blue_iron research; kills do not unlock materials. Unlocks reset on replay. Extraction every 3 seconds, deposit every 0.5 seconds, DP prices, construction costs, a free immutable bottom warehouse row, directional warehouse attachment and no power requirement are fan rules. Finished goods must be produced and deposited before withdrawal.'},ensure_ascii=False,indent=2),encoding='utf-8')
economy=configure(towers)
production_types[3]['role']='兑换 / 入库'
production_types[3]['desc']='交付成品可选择兑换部署费用、存入公共仓库或两者交替。入库材料用于研究、制造和弹药；交替模式下 折金票已满会自动入库。每份成品只结算一次。'
payload = {'towers':towers,'enemies':enemies,'waves':waves,'production':production,'economy':economy,'currency':{'name':'折金票','perPoint':100},
           'bossPractice':{'initialDP':500,'maxDP':500,'waves':[
               {'name':'先遣队试压', 'enemies':[10,8,11,9,10,8,2,6,0,10], 'gap':1.1, 'hp':1.9},{**waves[-1],'hp':2}]},
           'sprites':{id:art(id) for id in ['icon_belt_grid','icon_belt_corner_1','icon_belt_corner_2']},
           'map':{'width':64,'height':48,'corners':[[0,10],[8,10],[8,4],[20,4],[20,16],[37,16],[37,14]],
                  'core':{'id':'sp_hub_1','name':name(buildings['sp_hub_1']),'x':33,'y':5,
                          'footprint':{'width':buildings['sp_hub_1']['range']['width'],'depth':buildings['sp_hub_1']['range']['depth']},
                          'image':art('sp_hub_1'),'entrance':{'x':37.5,'y':14}},
                  'sectors':[[1,18,62,26,'生产区'],[10,6,8,8,'防御区']]},
           'rules':{'initialDP':40,'maxDP':ark['levelOptions']['maxCost'],'dpPerSecond':0,
                    'life':10,'refund':.5,'intermission':30},
           'sourceCommit':ark['commit']}
# The fixed core artwork uses native d0, unlike the rotatable machines (d3).
# Preserve the original fourteen input cells and six independently configured outputs.
core=payload['map']['core']
core['portCells']={kind:[dict(index=p['index'],x=p['trans']['position']['x'],
    y=core['footprint']['depth']-1-p['trans']['position']['z'],
    side=(p['trans']['rotation']['y']//90+(2 if kind=='inputs' else 0)+3)%4)
    for p in buildings['sp_hub_1']['inputPorts' if kind=='inputs' else 'outputPorts'] if not p['isPipe']]
    for kind in ('inputs','outputs')}
preview_assets=load(ROOT/'sources/preview_assets.json')['devices']
footprint_evidence['sp_hub_1']={'originalRange':buildings['sp_hub_1']['range'],'footprint':payload['map']['core']['footprint']}
(ROOT/'sources/building_geometry_reference.json').write_text(json.dumps({'source':(KIT/'tables/FactoryBuildingTable.json').relative_to(ROOT).as_posix(),'buildings':footprint_evidence,'coordinates':'Original +z points up. Production dir0 is native d3; clockwise turns rotate the entire footprint and every solid port cell.'},ensure_ascii=False,indent=2),encoding='utf-8')
payload['deviceArt']={bid:{**meta,'image':art('portrait_'+bid)} for bid,meta in preview_assets.items()}
payload['ui']={'cover':art('ui_blueprint_cover')}
animation_manifest=load(ROOT/'sources/wisadel_animation_manifest.json')
payload['wisadel']={**animation_manifest,'portrait':art('wisadel_portrait'),'animations':{
    key:{**clip,'pages':[{**p,'image':'data:image/webp;base64,'+base64.b64encode((ROOT/p['file']).read_bytes()).decode()} for p in clip['pages']]}
    for key,clip in animation_manifest['animations'].items()}}
reference = {**payload,'map':{**payload['map'],'core':{k:v for k,v in payload['map']['core'].items() if k!='image'}},'sprites':list(payload['sprites']),'towers':[{**{k:v for k,v in t.items() if k not in ('image','upgrades')},'upgrades':[{k:v for k,v in u.items() if k!='image'} for u in t['upgrades']]} for t in towers],
             'deviceArt':preview_assets,'ui':list(payload['ui']),'wisadel':animation_manifest,
             'production':{**production,'types':[{k:v for k,v in p.items() if k not in ('image','faces')} for p in production_types],'items':{id:{k:v for k,v in item.items() if k!='image'} for id,item in production_items.items()}},
             'enemies':[{k:v for k,v in e.items() if k!='image'} for e in enemies],
             'adaptation':'Original Endfield names/icons, level-1 enemy HP, range / 4 and chargeInterval as cadence reference. Original multi-input production recipes, batch quantities and durations. Arknights-inspired deployment points. Per-run research, costs, damage, material consumption, ammunition, DP capacity and exchange are fan design. No tower count limit or passive DP.'}
(ROOT/'sources/balance_reference.json').write_text(json.dumps(reference,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'sources/upgrade_references.json').write_text(json.dumps(upgrade_evidence,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'src/data.json').write_text(json.dumps(reference,ensure_ascii=False,indent=2),encoding='utf-8')
# Presentation-only music is deliberately outside the saved-game rules identity.
music_manifest=load(ROOT/'assets/music/manifest.json')
payload['music']={'tracks':[{**{k:v for k,v in t.items() if k!='file'},'src':'data:audio/mpeg;base64,'+base64.b64encode((ROOT/'assets/music'/t['file']).read_bytes()).decode()} for t in music_manifest['tracks']]}
html = (ROOT/'src/index.html').read_text('utf-8')
html=html.replace('<script>const DATA=',(ROOT/'src/session.html').read_text('utf-8')+'<script>const DATA=',1)
html=html.replace('<div class="header-actions">','<div class="header-actions"><span id="saveIndicator" class="session-save-indicator"></span><button id="sessionBtn">菜单</button><button id="blueprintsBtn">蓝图</button>',1)
style='\n'.join((ROOT/'src'/name).read_text('utf-8') for name in ['fonts.css','style.css','preview_theme.css','economy.css','hotbar.css','interface_theme.css','session.css'])
style=style.replace('__FONT_SC__','data:font/ttf;base64,'+base64.b64encode((ROOT/'assets/fonts/HarmonyOS_Sans_SC.ttf').read_bytes()).decode())
html=html.replace('__FONT_LICENSE__',escape((ROOT/'assets/fonts/LICENSE.txt').read_text('utf-8').rstrip('\x00')))
for key,file in load(ROOT/'sources/preview_assets.json')['decorations'].items():
    style=style.replace('__UI_'+key+'__',art(Path(file).stem))
audio_manifest={**load(ROOT/'assets/audio/manifest.json'),**load(ROOT/'assets/audio/wisadel_manifest.json')}
audio={key:['data:audio/mpeg;base64,'+base64.b64encode((ROOT/'assets/audio'/file).read_bytes()).decode() for file in files] for key,files in audio_manifest.items()}
app='\n'.join((ROOT/'src'/file).read_text('utf-8') for file in ['music.js','music_ui.js','currency.js','camera.js','actors.js','board_input.js','production_ui.js','economy_ui.js','build_tools.js','bulk_tools.js','hotbar.js','session.js','local_store.js','session_ui.js','app.js'])
scripts='\n'.join((ROOT/'src'/file).read_text('utf-8') for file in ['production.js','economy.js','placement.js','engine.js','audio.js'])+'\n'+app
# Adding formerly inactive core ports is a compatible fix. Keep the v0.18
# balance identity so existing runs restore with their new ports initially shut.
rules_reference={**reference,'map':{**reference['map'],'core':{k:v for k,v in reference['map']['core'].items() if k!='portCells'}}}
rules_id=hashlib.sha256(json.dumps(rules_reference,ensure_ascii=False,sort_keys=True).encode('utf-8')).hexdigest()
(ROOT/'dist').mkdir(exist_ok=True)
build_web(ROOT,html,style,payload,audio,scripts,rules_id,'0.18.2')
html=html.replace('<script>const DATA=','<script>globalThis.BlueprintBuild='+json.dumps(dict(web=False,version='0.18.2',rulesId=rules_id))+';const DATA=',1)
for key, value in [('DATA', json.dumps(payload,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')),
                   ('SOUNDS',json.dumps(audio,separators=(',',':'))),('AUDIO',(ROOT/'src/audio.js').read_text('utf-8')),
                   ('PLACEMENT',(ROOT/'src/placement.js').read_text('utf-8')),('ECONOMY',(ROOT/'src/economy.js').read_text('utf-8')),('PRODUCTION',(ROOT/'src/production.js').read_text('utf-8')),('ENGINE',(ROOT/'src/engine.js').read_text('utf-8')),('APP',app),
                   ('STYLE',style)]:
    html = html.replace('__'+key+'__',value)
(ROOT/'dist/offline').mkdir(exist_ok=True)
dest = ROOT/'dist/offline/blueprint_defense.html'
dest.write_text(html,encoding='utf-8')
print(f'Built {dest}: {dest.stat().st_size/1024:.0f} KiB; {len(towers)} original towers, {len(enemies)} original enemy portraits, {sum(len(w["enemies"]) for w in waves)} enemies')
