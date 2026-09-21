"""Convert the supplied WebM actions to game-clock-driven sprite atlases."""
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
INPUT=Path('C:/Users/Admin/Downloads')
BIN=Path('F:/4/干员立绘压缩姬/干员立绘压缩姬/ffmpeg/bin')
STATES=['Attack_Down_A','Attack_Down_B','Attack_Down_C','Default','Skill_1','Skill_2_Begin','Skill_2_End','Skill_2_Idle','Skill_2_Loop','Skill_2_Overload_Begin','Skill_2_Overload_End','Skill_2_Overload_Idle','Skill_2_Overload_Loop','Skill_3_Begin','Skill_3_End','Skill_3_Idle','Skill_3_Loop','Skill_Down_3_Idle','Skill_Down_3_Loop','Start','Stun']
SELECTED={'start':'Start','begin':'Skill_3_Begin','idle':'Skill_Down_3_Idle','attackA':'Attack_Down_A','attackB':'Attack_Down_B','attackC':'Attack_Down_C','special':'Skill_Down_3_Loop','recover':'Skill_3_End','stun':'Stun'}
FPS=20;SIZE=480

def prepare():
    source=ROOT/'sources/wisadel_animation';source.mkdir(exist_ok=True)
    assets=ROOT/'assets/wisadel';assets.mkdir(exist_ok=True)
    portrait=INPUT/'立绘_维什戴尔_skin2.png';shutil.copy2(portrait,ROOT/'assets/wisadel_portrait.png')
    records={}
    for state in STATES:
        name='维什戴尔-绝对主角-正面-'+state+'-x1'+(' (1)' if state=='Attack_Down_B' else '')+'.webm'
        file=INPUT/name;copy=source/(state+'.webm');shutil.copy2(file,copy)
        probe=subprocess.run([str(BIN/'ffprobe.exe'),'-v','error','-show_streams','-show_format','-of','json',str(copy)],capture_output=True,encoding='utf-8')
        meta=json.loads(probe.stdout);valid=probe.returncode==0 and bool(meta.get('streams'))
        records[state]={'name':name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'valid':valid,
                        'duration':float(meta.get('format',{}).get('duration',0)),'codec':meta.get('streams',[{}])[0].get('codec_name')}
    animations={}
    for key,state in SELECTED.items():
        assert records[state]['valid'],state
        frames=source/(state+'_frames');frames.mkdir(exist_ok=True)
        # The supplied AV1 recordings have an opaque black matte despite their
        # alpha_mode tag. Flood only the border-connected matte; preserve enclosed
        # black eyes/details. Two pixels of dilation retain the outer contour.
        filters=f'[0:v]fps={FPS},format=rgb24,split=2[c][m];[m]format=gray,lut=y=if(gt(val\\,12)\\,255\\,0),floodfill=x=0:y=0:s0=0:d0=128,lut=y=if(eq(val\\,128)\\,0\\,255),dilation,dilation[a];[c][a]alphamerge,scale={SIZE}:{SIZE}'
        subprocess.run([str(BIN/'ffmpeg.exe'),'-hide_banner','-loglevel','error','-y','-i',str(source/(state+'.webm')),'-filter_complex',filters,str(frames/'%04d.png')],check=True)
        # Crop a single shared rectangle per action so its registration never
        # jumps between frames. Drawing uses source-space offsets and a fixed foot.
        files=sorted(frames.glob('*.png'));bounds=[]
        for file in files:
            with Image.open(file) as im:
                box=im.getchannel('A').getbbox()
                if box:bounds.append(box)
        box=(max(0,min(b[0] for b in bounds)-2),max(0,min(b[1] for b in bounds)-2),min(SIZE,max(b[2] for b in bounds)+2),min(SIZE,max(b[3] for b in bounds)+2))
        w,h=box[2]-box[0],box[3]-box[1];pages=[]
        for start in range(0,len(files),64):
            batch=files[start:start+64];cols=min(8,len(batch));rows=math.ceil(len(batch)/cols);sheet=Image.new('RGBA',(cols*w,rows*h))
            for i,file in enumerate(batch):
                with Image.open(file) as im:sheet.paste(im.crop(box),((i%cols)*w,(i//cols)*h))
            dest=assets/f'{key}_{start//64}.webp';sheet.save(dest,'WEBP',lossless=True,method=5)
            pages.append({'file':str(dest.relative_to(ROOT)).replace('\\','/'),'start':start,'count':len(batch),'columns':cols,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()})
        animations[key]={'state':state,'fps':FPS,'frames':len(files),'duration':len(files)/FPS,'sourceDuration':records[state]['duration'],'box':list(box),'width':w,'height':h,'pages':pages}
    manifest={'size':SIZE,'anchor':[SIZE*.5,SIZE*.815],'bodyWidth':SIZE*.42,'animations':animations,
              'portrait':'assets/wisadel_portrait.png','portraitSha256':hashlib.sha256(portrait.read_bytes()).hexdigest()}
    (ROOT/'sources/wisadel_animation_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    (ROOT/'sources/wisadel_animation_provenance.json').write_text(json.dumps({'files':records,'usedStates':SELECTED,'emptyFallback':'Default is empty; use valid Skill_Down_3_Idle. Empty Skill_2_End and Skill_2_Overload_Begin are not scheduled.',
        'method':'Decode user WebM at 20 fps; reconstruct alpha from border-connected black matte, preserve enclosed dark details, scale to 480, pack lossless WebP atlases. Original videos and supplied PNG are preserved unmodified.',
        'runtime':'Animations follow simulation time, not HTML video playback. Attack A/B/C rotate with a skill loop every fourth shot; refit enters Start and Skill_3_Begin; suppression uses Stun and Skill_3_End recovery.'},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'clips':len(animations),'frames':sum(a['frames'] for a in animations.values()),'bytes':sum((ROOT/p['file']).stat().st_size for a in animations.values() for p in a['pages']),'empty':[s for s,r in records.items() if not r['valid']]},ensure_ascii=False))

if __name__=='__main__':prepare()
