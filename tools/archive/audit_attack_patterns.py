"""Audit authored attack timelines; verify the three turret envelopes in current bytes.

The old schema does not decode the current payload safely. This deliberately
verifies only timeline envelope counts, frames, action counts and blackboard
coefficients, and does not pretend to decode all current action union types.
"""
import hashlib
import json
from pathlib import Path
import struct
import zipfile

ROOT=Path(__file__).resolve().parents[1]
families={'turret':3,'cannon':2,'frost':1,'laser':2,'lightning':2,'sniper':1,'debuff':1,'trap':1}
out=ROOT/'sources/attack_skills';out.mkdir(exist_ok=True)
report={'referenceVersion':'1.4.4 user archive','frameRate':30,
        'frameRateBasis':'30 Hz conversion used by supplied SkillDataSummary; runtime tick rate is not independently measured here.',
        'scope':'Full action semantics below come from the decoded archive. Current turret envelope/blackboard matches are checked separately; current full-schema decode failed and is not used.',
        'towers':{}}
with zipfile.ZipFile('F:/4/json全解.zip') as archive:
    for family,tiers in families.items():
        for tier in range(1,tiers+1):
            id=f'battle_{family}_{tier}';name=f'int_fac_{id}_skill.json'
            file=next(n for n in archive.namelist() if n.endswith('/SkillData/'+name))
            raw=archive.read(file);(out/name).write_bytes(raw)
            data=json.loads(raw.decode('utf-8-sig'))['data'];timelines=data['actionGroupData']['timelineActions']
            row={'skill':name,'referenceSha256':hashlib.sha256(raw).hexdigest(),'durationFrames':data['durationFrame'],
                 'blackboard':{p['key']:p['valueDouble'] for p in data['blackboard']},'timelines':[]}
            for tl in timelines:
                actions=tl['_sequenceActionData']['actionData']
                row['timelines'].append({'start':tl['_startFrame'],'end':tl['_endFrame'],
                    'actions':[a['_actionType'] for a in actions],
                    'sounds':[a['_soundEvent'] for a in actions if '_soundEvent' in a],
                    'projectiles':[a['projectileId'] for a in actions if 'projectileId' in a],
                    'damageScaleKeys':[u['atkScale']['blackboardKey'] for a in actions for u in a.get('damageUnits',[])]})
            if family=='turret':
                current=ROOT/'sources/audio/current_skills'/name;b=current.read_bytes()
                assert b[1]==2 and struct.unpack_from('<i',b,2)[0]==0
                count=struct.unpack_from('<i',b,6)[0];assert count==len(timelines)
                headers=[]
                for i in range(10,len(b)-14):
                    if b[i]!=4 or b[i+5]!=3:continue
                    end=struct.unpack_from('<i',b,i+1)[0];n=struct.unpack_from('<i',b,i+6)[0]
                    if 0<=end<200 and 1<=n<15 and (i==10 or b[i-14:i]==b'\x04'+bytes(13)):
                        headers.append((i,end,n))
                assert len(headers)==count
                verified=[]
                for index,(offset,end,n) in enumerate(headers):
                    ref=timelines[index];assert end==ref['_endFrame']
                    assert n==len(ref['_sequenceActionData']['actionData'])
                    marker=bytes(2)+struct.pack('<i',ref['_startFrame'])+b'\x04'+bytes(13)
                    if index+1<len(headers):end_offset=headers[index+1][0]
                    else:
                        matches=[j+len(marker) for j in range(offset+10,len(b)-len(marker)+1) if b[j:j+len(marker)]==marker]
                        assert len(matches)==1;end_offset=matches[0]
                    assert b[end_offset-20:end_offset]==marker
                    verified.append({'offset':offset,'endOffset':end_offset,'start':ref['_startFrame'],'end':end,'actionCount':n})
                coefficients={}
                for key,value in row['blackboard'].items():
                    encoded=key.encode();prefix=b'\x04\x00'+struct.pack('<i',len(encoded))+encoded
                    index=b.find(prefix,verified[-1]['endOffset']);assert index>=0
                    actual=struct.unpack_from('<d',b,index+len(prefix))[0];assert abs(actual-value)<1e-9
                    coefficients[key]={'value':actual,'offset':index}
                row['currentVerification']={'file':str(current),'sha256':hashlib.sha256(b).hexdigest(),
                    'rootMemberCount':b[0],'envelopes':verified,'blackboard':coefficients}
                damage=[t for t in row['timelines'] if t['damageScaleKeys']]
                hit_frames=[t['start'] for t in damage]
                # One visible tracer per damage pulse. The extra frame-13 visual
                # in turret 3 is retained as the impact flash, not a seventh hit.
                launch_frames=[t['start'] for t in row['timelines'] if 'EffectAction_EffectActionData' in t['actions']][:len(damage)]
                weights=[row['blackboard'][t['damageScaleKeys'][0]] for t in damage]
                fire_frames=[t['start'] for t in row['timelines'] if f'au_int_fac_{id}_skill' in t['sounds']]
                hit_audio=[t['start'] for t in row['timelines'] if any(s.endswith(('_skill_hit','_skill_hit_bomb')) for s in t['sounds'])]
                if tier==3:hit_audio=hit_frames # Current damage units explicitly contain the normal-hit event.
                row['burst']={'fps':30,'launchFrames':launch_frames,'hitFrames':hit_frames,'weights':weights,
                    'fireFrames':fire_frames,'hitAudioFrames':hit_audio,'enhancedIndex':len(damage)-1 if tier>1 else -1,'splashLast':tier==3}
                assert abs(sum(weights)-1)<1e-8
            report['towers'][id]=row
(ROOT/'sources/attack_pattern_audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({id:r.get('burst',{'durationFrames':r['durationFrames']}) for id,r in report['towers'].items()},ensure_ascii=False,indent=2))
