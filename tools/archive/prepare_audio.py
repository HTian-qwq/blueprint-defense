"""Prepare compact fan-game mixes from event-verified original Wwise media.

This selects random-container variants and sums layer-container leaves. It does
not reproduce Wwise buses, RTPC, spatial attenuation, action delays or effects.
"""
import array
import hashlib
import json
import math
from pathlib import Path
import subprocess
import wave

ROOT=Path(__file__).resolve().parents[1]
FFMPEG=Path('F:/4/干员立绘压缩姬/干员立绘压缩姬/ffmpeg/bin/ffmpeg.exe')
source=ROOT/'sources/audio'
events={e['event']:e for e in json.loads((source/'event_trace.json').read_text('utf-8'))['events']}
out=ROOT/'assets/audio';out.mkdir(exist_ok=True)
mixdir=source/'mix';mixdir.mkdir(exist_ok=True)
clips={};records=[];profiles={}
build_table=json.loads((source/'tables/AudioBattleBuildings.json').read_text('utf-8'))

def prepare(key,event_name,variants=3,limit=2.5,start=0):
    event=events[event_name]
    kinds={t['id']:t['type'] for t in event['trace']}
    alternatives={}
    for sound in event['sounds']:
        for parent,child in zip(sound['chain'][2:],sound['chain'][3:]):
            if kinds[parent]==5:alternatives.setdefault(parent,set()).add(child)
    clips[key]=[]
    for variant in range(variants):
        chosen={p:sorted(ids)[variant%len(ids)] for p,ids in alternatives.items()}
        leaves=[s for s in event['sounds'] if all(p not in chosen or chosen[p]==c for p,c in zip(s['chain'][2:],s['chain'][3:]))]
        ids=sorted({s['mediaId'] for s in leaves})
        assert ids
        inputs=[v for id in ids for v in ['-i',str(source/'wav'/f'{id}.wav')]]
        mixed=mixdir/f'{key}_{variant}.wav'
        filters=f'amix=inputs={len(ids)}:normalize=1:dropout_transition=0,volume=0.8,atrim=start={start}:duration={limit},asetpts=PTS-STARTPTS,aresample=32000'
        subprocess.run([str(FFMPEG),'-hide_banner','-loglevel','error','-y',*inputs,'-filter_complex',filters,'-ac','1','-c:a','pcm_s16le',str(mixed)],check=True)
        with wave.open(str(mixed),'rb') as w:
            duration=w.getnframes()/w.getframerate();values=array.array('h',w.readframes(w.getnframes()))
        peak=max(abs(v) for v in values)/32768
        rms=math.sqrt(sum(v*v for v in values)/len(values))/32768
        assert 0<rms and peak<.999, f'Empty or clipped source mix: {key}'
        gain=min(.18/rms,.8/peak,12)
        target=out/f'{key}_{variant}.mp3'
        filters=f'volume={gain},afade=t=in:d=0.005,afade=t=out:st={max(0,duration-.09)}:d=0.09'
        subprocess.run([str(FFMPEG),'-hide_banner','-loglevel','error','-y','-i',str(mixed),'-af',filters,'-c:a','libmp3lame','-b:a','96k','-map_metadata','-1',str(target)],check=True)
        clips[key].append(target.name)
        records.append({'key':key,'variant':variant,'event':event_name,'eventId':event['eventId'],
                        'mediaIds':ids,'chains':[s['chain'] for s in leaves],'file':'assets/audio/'+target.name,
                        'duration':duration,'trimStart':start,'gain':gain,'sourceMixPeak':peak,'sourceMixRms':rms,
                        'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})

for tower,tiers in (('turret',3),('cannon',2),('frost',1),('laser',2),('lightning',2),('sniper',1),('debuff',1),('trap',1),('rocket',1)):
    for tier in range(1,tiers+1):
        building=f'battle_{tower}_{tier}'
        family=tower+(str(tier) if tier>1 else '')
        prefix=f'au_int_fac_battle_{tower}_{tier}_'
        profile=profiles[building]={}
        def bind(action,event,**kwargs):
            key=family+'.'+action;prepare(key,event,**kwargs);profile[action]=key
        fire='au_int_fac_battle_trap1_blast_start' if tower=='trap' else prefix+'skill'
        bind('fire',fire,limit=3.16 if tower=='trap' else 1.6 if tower=='turret' else 2.5)
        if prefix+'skill_hit' in events:
            bind('hit',prefix+'skill_hit',limit=1.5 if tower in ('turret','laser') else 2.4)
        # The current table explicitly shares some build events across tiers.
        event_id=build_table[building]['audioBuildUp']&0xffffffff
        event=next(e for e in events.values() if e['eventId']==event_id)
        existing=next((r['key'] for r in records if r['eventId']==event_id),None)
        if existing:profile['deploy']=existing
        else:bind('deploy',event['event'],variants=1,limit=2)
        if prefix+'skill_charge' in events:
            bind('charge',prefix+'skill_charge',variants=1,limit=.22 if tower=='laser' else .12,start=.50 if tower=='laser' else 0)
        if prefix+'skill_hit_bomb' in events:
            bind('hitBomb',prefix+'skill_hit_bomb',limit=2.1)
        if tower=='trap':bind('end','au_int_fac_battle_trap1_blast_end',limit=1.1)
for action,event,limit in [('charge','skill01_charge_a',1.2),('slam','skill01_exp',1.4),('flameCharge','skill13_charge',1),('flame','skill13_fire',1.6)]:
    prepare('rodin.'+action,'au_eny_0051_rodin_'+event,variants=1,limit=limit)
(out/'manifest.json').write_text(json.dumps(clips,indent=2),encoding='utf-8')
(out/'profiles.json').write_text(json.dumps(profiles,indent=2),encoding='utf-8')
provenance={'format':'mono MP3 32 kHz / 96 kbps','wwiseBankVersion':150,
    'parserReference':'https://github.com/bnnm/wwiser/blob/master/wwiser/parser/wparser.py',
    'method':'Event hash -> Play action -> DirectParentID child graph -> Sound sourceID. Random containers: one variant per mix; layer containers: sum selected leaves. Prototype timing, trimmed tails, level adjustment. Not full Wwise runtime mixing.',
    'unverified':'Cannon and acid have verified launch events but no separately verified impact events. Their earlier substituted impacts are removed, not relabelled as original tower impacts. VFX names alone are not audio binding evidence.',
    'profiles':profiles,
    'bossAudio':'Rodin charge/slam and flame charge/fire use his skill01/skill13 event names from the supplied 1.4.4 archive, verified against current Wwise event banks. Short clips and two-phase gameplay timing are fan adaptations; they do not reconstruct the complete original boss timeline.',
    'buildEvidence':'Current AudioBattleBuildings.audioBuildUp IDs matched against bank events. Cannon 2, laser 2 and turret 2 intentionally share the base build event; lightning 2 and turret 3 use distinct events.',
    'skillEvidence':'Current length-prefixed SkillData strings verify trap1_blast_start/end and turret_3_skill_hit_bomb; current raw bytes and source hashes are retained under sources/audio/current_skills. Other numbered family events match their exact FNV-1 hashes in current Wwise banks.',
    'timing':'Charges are shortened to prototype wind-ups (.22 s laser, .12 s lightning). Flame start mix is trimmed to 3.16 s; its voice is stopped when that shot\'s 3 s damage zone ends, then the original blast_end event plays. Playback pitch is unchanged at 2x game speed.',
    'extraction':'Read-only selective PCK ranges from current VFS index. Persistent index preferred; base fallback only if its manifest MD5 matches. WEM hashes recorded. Full multi-GB stream PCK content MD5 was not re-read/verified.',
    'clips':records}
(ROOT/'sources/audio_provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Prepared {len(records)} clips / {len(clips)} cues / {sum((ROOT/r["file"]).stat().st_size for r in records)/1024:.0f} KiB')
