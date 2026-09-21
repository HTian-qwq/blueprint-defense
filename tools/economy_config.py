"""Fan economy. Original geometry, recipes, attack cadence and audio stay in build.py."""
def configure(towers):
    shell='item_crystal_shell'; glass='item_quartz_glass'; powder='item_originium_powder'
    iron='item_iron_nugget'; parts='item_iron_cmpt'
    steel='item_iron_enr'; steelparts='item_iron_enr_cmpt'; crystal='item_quartz_enr'; crystalparts='item_glass_enr_cmpt'
    glassparts='item_glass_cmpt'; sand='item_plant_moss_powder_3'; dense='item_crystal_enr'
    battery='item_proc_battery_1'; battery2='item_proc_battery_2'; battery3='item_proc_battery_3'
    nodes=[]
    def node(id,name,branch,requires,cost,materials,seconds,desc,**extra):
        nodes.append(dict(id=id,name=name,branch=branch,requires=requires,cost=cost,materials=materials,seconds=seconds,desc=desc,**extra))
    node('logistics','仓储扩容','工程',[],16,{shell:6},12,'折金票容量由 9,900 提高至 20,000。',dpCapacity=200)
    node('ballistics','弹道工程','火力',[],22,{shell:8},15,'解锁榴弹塔与扩装铳械塔。')
    node('chemistry','应用化学','工程',[],22,{glass:6,powder:6},15,'解锁酸液、燃烧塔及液氮、酸液、燃烧设备二级强化。')
    node('electromagnetics','电磁工程','能量',['blue_iron'],28,{glass:10,iron:4},18,'解锁射线塔、电涌塔。')
    node('heavy','重型武器','火力',['ballistics','blue_iron'],40,{parts:12,shell:12},35,'解锁哨戒塔、重锤迫击炮及二级榴弹、哨戒改装。')
    node('storm','密集火力','火力',['ballistics','logistics','densification'],80,{parts:12,steelparts:6,shell:18},70,'以钢制零件强化供弹机构，解锁暴雨铳械塔。整轮伤害为基础铳械塔的 7 倍。')
    node('overcharge','高能回路','能量',['electromagnetics','crystal','batteries'],90,{crystalparts:6,battery:1,glass:12},90,'以高晶零件和谷地电池构建高能回路，解锁高能射线与电涌改装。')
    node('precision','精密战备','工程',['heavy','chemistry','industrial'],150,{steelparts:12,crystalparts:8,battery3:1},80,'解锁三级液氮、哨戒、酸液、燃烧强化与维什戴尔改件。改装需要钢材、高晶及电池供应。',dpCapacity=350)
    node('blue_iron','蓝铁冶炼','基础加工',[],20,{shell:8,glass:6},25,'解锁蓝铁矿无限取货及蓝铁块、铁制零件配方。蓝铁矿 → 蓝铁块 → 铁制零件，为武器、研磨与电池生产供应材料。',production=True,products=['item_iron_ore',iron,parts])
    node('components','精密加工','基础加工',[],16,{shell:6,glass:4},20,'配件机新增紫晶零件。紫晶矿 → 紫晶纤维 → 紫晶零件，用于电池封装与高晶精炼。',production=True,products=[glassparts])
    node('powder','粉体工艺','基础加工',[],20,{shell:8,powder:8},25,'解锁砂叶无限取货，以及砂叶、蓝铁块、紫晶纤维、晶体外壳的粉碎配方。1 份砂叶产出 3 份砂叶粉末。',production=True,products=[sand,'item_iron_powder','item_quartz_powder','item_crystal_powder'])
    node('densification','致密冶炼','材料精炼',['powder','logistics','blue_iron'],50,{iron:8,powder:12,sand:6},40,'解锁研磨机：2 份矿物粉末 + 1 份砂叶粉末 → 致密材料。致密蓝铁粉末 → 钢块 → 钢制零件；同时解锁致密源石粉末与密制晶体。',production=True,products=[steel,steelparts,dense,'item_originium_enr_powder'],machine='thickener_1')
    node('crystal','高晶精炼','材料精炼',['densification','components'],65,{dense:6,steel:6,glassparts:8},50,'紫晶粉末 + 砂叶粉末 → 高晶粉末 → 高晶纤维 → 高晶零件。为能量设备与集成制造供应高阶材料。',production=True,products=[crystal,crystalparts])
    node('batteries','电池封装','工业制造',['components'],40,{glassparts:10,powder:15},35,'解锁封装机与低容、中容谷地电池。零件与源石粉末分别接入，收齐后每批封装 10 秒。电池可整份兑换，也可入库供给研究。',production=True,products=[battery,battery2],machine='tools_assebling_mc_1')
    node('industrial','集成制造','工业制造',['batteries','crystal'],100,{steelparts:12,crystalparts:8,battery2:1},60,'解锁高容谷地电池：10 钢制零件 + 15 致密源石粉末 → 1 电池。折金票容量提高至 50,000，为精密战备提供能源。',production=True,products=[battery3],dpCapacity=500)
    base_costs=[9,24,10,30,28,36,22,24,48]
    requirements=[None,'ballistics',None,'electromagnetics','electromagnetics','heavy','chemistry','chemistry','heavy']
    materials=[{},{shell:4},{},{glass:6},{glass:4,iron:2},{parts:4},{powder:4},{powder:4},{parts:6,shell:4}]
    ammo=[None,(shell,2),None,(glass,2),(glass,2),(parts,2),(powder,3),(powder,3),(parts,1)]
    upgrades=[['ballistics','storm'],['heavy','storm'],['chemistry','precision'],['overcharge','overcharge'],['overcharge','overcharge'],['heavy','precision'],['chemistry','precision'],['chemistry','precision'],['precision']]
    for i,t in enumerate(towers):
        t.update(cost=base_costs[i],research=requirements[i],materials=materials[i],ammo=dict(item=ammo[i][0],volleys=ammo[i][1]) if ammo[i] else None)
        for stage,u in enumerate(t['upgrades'],1):
            if i==8:
                u.update(cost=120,research='precision',materials={parts:24,shell:24},ammo=dict(item=parts,volleys=1))
                continue
            u.update(cost=round(base_costs[i]*(1.6 if stage==1 else 2.6)),research=upgrades[i][stage-1],
                     materials=({shell:4} if i==0 else {glass:4} if i in (2,3,4) else {powder:4} if i in (6,7) else {parts:4}) if stage==1 else {parts:6},
                     damage=round(t['damage']*(3 if stage==1 else 7)))
            fuel=(shell,2) if i==0 and stage==1 else (parts,1) if i in (0,1,5) else (glass,2 if stage==1 else 1) if i in (2,3,4) else (powder,2 if stage==1 else 1)
            u['ammo']=dict(item=fuel[0],volleys=fuel[1])
            if stage==2: u['materials']={steelparts:6} if i not in (2,3,4) else {crystalparts:6}
            if i in (3,4): u['materials']={glass:4,crystalparts:4}
            if u.get('burnDps'):
                old=u['burnDps'];u['burnDps']*=2;u['desc']=u['desc'].replace(f'{old} 点',f'{u["burnDps"]} 点')
            if u.get('orbDps'):
                old=u['orbDps'];u['orbDps']*=2;u['desc']=u['desc'].replace(f'{old} 点',f'{u["orbDps"]} 点')
            # Keep the original behavior description; the adjacent stats show current damage.
        t['reference']['costSource']='fan economy v0.12; Arknights DP model reference only'
    towers[8]['upgrades'][0]['materials']={steelparts:24,crystalparts:12,battery3:1}
    return dict(version=2,nodes=nodes,description='Per-run industrial and combat research; original multi-input recipes supply advanced refits, batteries and research. No tower count limit or passive DP.')
