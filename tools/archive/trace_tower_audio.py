"""Trace current Wwise event IDs to Sound objects, retaining reference evidence."""
import importlib.util
import json
from pathlib import Path
import struct
import sys
import re
from collections import defaultdict

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('audio_reader',r'F:\4\endfield_research_kit_json\scripts\build_audio.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
objects={}
banks={}
for file in (ROOT/'sources/audio/banks/bnk').glob('*.bnk'):
    for id,obj in mod.parse_hirc_objects(file.read_bytes()).items():
        objects[id]=obj;banks[id]=file.name

def direct_parent(obj):
    """Wwise v150 NodeBase prefix, per wwiser's public format documentation."""
    data=obj['data'];p=14 if obj['type']==2 else 0
    if obj['type']==2 and struct.unpack_from('<I',data)[0]&15==2:return None
    fx=data[p+1];p+=2
    if fx:p+=1+6*fx
    metadata=data[p+1];p+=2+6*metadata
    return struct.unpack_from('<I',data,p+4)[0]

children=defaultdict(list)
for oid,obj in objects.items():
    if obj['type'] not in (2,5,6,7,9):continue
    try:parent=direct_parent(obj)
    except (IndexError,struct.error):continue
    if parent in objects:children[parent].append(oid)

names=set()
for family in ('debuff','cannon','trap','corrosiontower','cannontower'):
    for prefix in (f'au_int_fac_battle_{family}1',f'au_int_fac_battle_{family}2',f'au_int_fac_battle_{family}_1',f'au_int_fac_battle_{family}_2'):
        for suffix in ('blast','blast_start','blast_end','blast_hit','hit','skill','skill_hit','bullet_hit','attack','attack_hit','explosion','explode','bomb','skill_hit_bomb','skill01_hit'):
            names.add(prefix+'_'+suffix)
for prefix in ('au_int_fac_battle_trap_1','au_eny_0047_firebat','au_int_fac_battle_debuff_1'):
    for suffix in ('fire','fire_start','fire_loop','skill_loop','skill01','skill01_hit','skill02','active','open','work','working','loop','attack_loop','skill_effect','skill_end','skill_start','skill_hit','skill01_loop'):
        names.add(prefix+'_'+suffix)
for prefix in ('au_eny_0039_agcanno','au_agcanno','au_int_fac_battle_cannon_1','au_int_fac_battle_cannon','au_interactive_cannontower'):
    for suffix in ('skill01_hit','skill_hit','skill01_projhit','skill_hitspot','skill01','skill02','skill02_hit','hit','hitspot','skill_proj_hit','skill_bomb','explode','skill_explode'):
        names.add(prefix+'_'+suffix)
for tower in ('turret','cannon','frost','laser','lightning','sniper','debuff','trap','rocket'):
    for tier in (1,2,3):
        for suffix in ('skill','skill_hit','skill_charge','skill_passby','skill_fire','skill_projhit','attack','attack_hit','skill_launch','skill_explosion','skill_end','skill_start','build','buildup','remove','skill_plus','skill_plus_hit','skill_normal','skill_strong','skill_strong_hit'):
            names.add(f'au_int_fac_battle_{tower}_{tier}_{suffix}')
references=[]
for file in (ROOT/'sources/audio/current_skills').glob('int_fac*.json'):
    raw=file.read_bytes()
    for match in re.finditer(b'au_',raw):
        offset=match.start()
        if offset<4:continue
        length=struct.unpack_from('<i',raw,offset-4)[0]
        if not 3<length<300:continue
        value=raw[offset:offset+length].decode('utf-8',errors='replace')
        if not re.fullmatch(r'au_[A-Za-z0-9_]+',value):continue
        names.add(value);references.append({'event':value,'file':str(file),'rawOffset':offset,'stringByteLength':length,'source':'current VFS skill binary; length-prefixed string'})
skill_root=Path(r'F:\4\EndfieldData-main\endfielddata\Json\SkillData')
for file in [*skill_root.glob('int_fac_battle_*.json'),*(ROOT/'sources/enemy_skills').glob('eny_0051_*.json')]:
    if not any(t in file.name for t in ('turret','cannon','frost','laser','lightning','sniper','debuff','trap','rocket','0051_rodin')):continue
    def visit(x):
        if isinstance(x,dict):
            for k,v in x.items():
                if k in ('_soundEvent','soundEvent') and isinstance(v,str) and v:
                    names.add(v);references.append({'event':v,'file':str(file),'field':k})
                visit(v)
        elif isinstance(x,list):
            for v in x:visit(v)
    visit(json.loads(file.read_text('utf-8')))
results=[]
for name in sorted(names):
    id=mod.fnv1_32(name.lower());event=objects.get(id)
    if not event or event['type']!=4:continue
    pending=[(i,[id]) for i in mod.hirc_event_action_ids(event['data'])];visited=set();sounds=[];trace=[]
    while pending:
        current,chain=pending.pop(0)
        if current in visited or current not in objects:continue
        visited.add(current);obj=objects[current];data=obj['data'];kind=obj['type'];path=chain+[current]
        trace.append({'id':current,'type':kind,'bytes':len(data),'prefix':data[:48].hex(),'bank':banks[current]})
        if kind==2:
            # AkBankSourceData: pluginId u32, streamType u8, sourceID u32 (bank v150).
            sounds.append({'objectId':current,'pluginId':struct.unpack_from('<I',data)[0],
                           'streamType':data[4],'mediaId':struct.unpack_from('<I',data,5)[0],
                           'chain':path,'bank':banks[current]})
            continue
        if kind==3:
            if data[1]==4:pending.append((mod.hirc_action_target_id(data),path))
        else:
            pending.extend((value,path) for value in children[current])
    results.append({'event':name,'eventId':id,'bank':banks[id],'sounds':sounds,'trace':trace})
out={'objects':len(objects),'skillReferences':references,'events':results}
(ROOT/'sources/audio/event_trace.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps([{'event':r['event'],'media':[s['mediaId'] for s in r['sounds']]} for r in results],ensure_ascii=False,indent=2))
