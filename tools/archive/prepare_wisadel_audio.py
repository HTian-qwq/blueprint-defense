"""Pitch-shift user-supplied WAVs without speeding up speech or altering originals."""
import array
import base64
import hashlib
import html
import json
import math
from pathlib import Path
import shutil
import subprocess
import wave

ROOT=Path(__file__).resolve().parents[1]
INPUT=Path('C:/Users/Admin/Downloads')
FFMPEG=Path('F:/4/干员立绘压缩姬/干员立绘压缩姬/ffmpeg/bin/ffmpeg.exe')
PITCH=1.65

def wav_info(file):
    with wave.open(str(file),'rb') as w:
        samples=array.array('h',w.readframes(w.getnframes()))
        return {'seconds':w.getnframes()/w.getframerate(),'rate':w.getframerate(),
                'peak':max(abs(x) for x in samples)/32768,'rms':math.sqrt(sum(x*x for x in samples)/len(samples))/32768}

def prepare():
    raw=ROOT/'sources/audio/wisadel_original';raw.mkdir(exist_ok=True)
    mixed=ROOT/'sources/audio/wisadel_helium';mixed.mkdir(exist_ok=True)
    output=ROOT/'assets/audio';records=[];manifest={'wisadel.attack':[],'wisadel.deploy':[]}
    files=[('作战中'+str(i)+suffix+'.wav','wisadel.attack',n) for n,(suffix,i) in enumerate((s,i) for s in ('',' (1)') for i in range(1,5))]
    files.append(('行动出发.wav','wisadel.deploy',0))
    for name,key,index in files:
        source=INPUT/name;copy=raw/f'{key}_{index}.wav';shutil.copy2(source,copy)
        original=wav_info(copy);pcm=mixed/copy.name;dest=output/f'{key}_{index}.mp3'
        filters=f'rubberband=tempo=1:pitch={PITCH}:formant=shifted:transients=smooth,highpass=f=100,loudnorm=I=-18:TP=-3:LRA=9,aresample=32000,alimiter=limit=0.82:level=disabled,afade=t=in:d=0.008,afade=t=out:st={max(0,original["seconds"]-.05)}:d=0.05'
        subprocess.run([str(FFMPEG),'-hide_banner','-loglevel','error','-y','-i',str(copy),'-af',filters,'-ac','1','-c:a','pcm_s16le',str(pcm)],check=True)
        processed=wav_info(pcm)
        assert abs(processed['seconds']-original['seconds'])<.12
        assert .001<processed['rms'] and processed['peak']<.9
        subprocess.run([str(FFMPEG),'-hide_banner','-loglevel','error','-y','-i',str(pcm),'-c:a','libmp3lame','-b:a','96k','-map_metadata','-1',str(dest)],check=True)
        source_hash=hashlib.sha256(source.read_bytes()).hexdigest();assert source_hash==hashlib.sha256(copy.read_bytes()).hexdigest()
        manifest[key].append(dest.name)
        records.append({'name':name,'key':key,'variant':index,'source':str(source),'sourceCopy':str(copy.relative_to(ROOT)).replace('\\','/'),
                        'file':str(dest.relative_to(ROOT)).replace('\\','/'),'sourceSha256':source_hash,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),
                        'original':original,'processed':processed})
    (output/'wisadel_manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    provenance={'origin':'User-provided recordings; not extracted Endfield tower events','pitchFactor':PITCH,'semitones':12*math.log2(PITCH),'tempo':1,
                'method':'FFmpeg Rubber Band pitch shift with shifted formants, duration preserved; normalized and peak-limited; original files untouched.',
                'playback':'One rotating battle line per mortar launch after the Wisadel refit. Deployment line on refit. Latest voice replaces previous dialogue globally, including at 2x speed. Battle SFX continue.',
                'clips':records}
    (ROOT/'sources/wisadel_audio_provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2),encoding='utf-8')
    rows=''.join(f'<article><h2>{html.escape(r["name"])}</h2><div><label>原声<audio controls preload="none" src="../{r["sourceCopy"]}"></audio></label><label>氦气版<audio controls preload="none" src="../{r["file"]}"></audio></label></div></article>' for r in records)
    preview='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>维什戴尔改件 · 氦气语音试听</title><style>body{max-width:800px;margin:36px auto;padding:0 20px;background:#e5e5e5;color:#303238;font:16px system-ui}h1{font-size:25px}p{line-height:1.7}article{border-top:1px solid #bbb;padding:12px 0}h2{font-size:17px}article div{display:flex;flex-wrap:wrap;gap:24px}label{display:grid;gap:8px}audio{width:320px;max-width:80vw}</style><h1>维什戴尔改件 · 氦气语音试听</h1><p>音调提升约 9 个半音，保持原句长度。8 条战斗语音轮换使用，「行动出发」在改装完成时播放。</p>'''+rows+'''<script>document.addEventListener('play',e=>{if(e.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause()})},true)</script></html>'''
    (ROOT/'reports/wisadel_voice_preview.html').write_text(preview,encoding='utf-8')
    standalone=preview
    for r in records:
        for field,mime in [('sourceCopy','audio/wav'),('file','audio/mpeg')]:
            uri='data:'+mime+';base64,'+base64.b64encode((ROOT/r[field]).read_bytes()).decode()
            standalone=standalone.replace('../'+r[field],uri)
    (ROOT/'dist').mkdir(exist_ok=True)
    (ROOT/'dist/wisadel_voice_preview.html').write_text(standalone,encoding='utf-8')
    print(f'Prepared {len(records)} helium clips (+{provenance["semitones"]:.2f} semitones, tempo unchanged)')

if __name__=='__main__':prepare()
