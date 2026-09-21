"""Read the user-provided JSON archive without unpacking its large level files."""
import collections
import hashlib
import json
from pathlib import Path
import zipfile

ROOT=Path(__file__).resolve().parents[1]
archive=Path('F:/4/json全解.zip')
report={'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'categories':{},'relevantFiles':[]}
with zipfile.ZipFile(archive) as z:
    files=[i for i in z.infolist() if not i.is_dir()]
    counts=collections.Counter(i.filename.split('/')[1] for i in files)
    report.update(files=len(files),uncompressedBytes=sum(i.file_size for i in files),categories=dict(counts))
    for info in files:
        if not any(term in info.filename.lower() for term in ('int_fac_battle_','agcanno_skill01_projhit','audio')):continue
        text=z.read(info).decode('utf-8-sig');data=json.loads(text)
        refs=[]
        def visit(v):
            if isinstance(v,dict):
                for k,x in v.items():
                    if isinstance(x,(str,int,float)) and x and any(t in k.lower() for t in ('sound','audio','effectname','projectileid','damage','durationframe')):refs.append({'field':k,'value':x})
                    visit(x)
            elif isinstance(v,list):
                for x in v:visit(x)
        visit(data)
        old=Path('F:/4/EndfieldData-main/endfielddata/Json').joinpath(*info.filename.split('/')[1:])
        same=json.loads(old.read_text('utf-8-sig'))==data if old.is_file() else None
        report['relevantFiles'].append({'file':info.filename.split('/',1)[1],'bytes':info.file_size,'jsonDate':info.date_time,
                                       'sameAsPriorDataset':same,'references':refs})
        if '/SkillData/' in info.filename and any(t in info.filename for t in ('int_fac_battle_turret_1','int_fac_battle_cannon_1','int_fac_battle_frost_1','int_fac_battle_laser_1')):
            dest=ROOT/'sources/archive_skills'/Path(info.filename).name;dest.parent.mkdir(exist_ok=True);dest.write_text(text,encoding='utf-8')
(ROOT/'reports/json_archive_inspection.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='relevantFiles'},ensure_ascii=False,indent=2))
for f in report['relevantFiles']:
    if f['file'].startswith('SkillData/') and any(t in f['file'] for t in ('battle_cannon_1_skill_projhit.json','battle_turret_1_skill.json','battle_laser_1_skill.json','battle_frost_1_skill.json')):
        print(json.dumps(f,ensure_ascii=False))
