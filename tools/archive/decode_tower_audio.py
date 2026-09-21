"""Decode only verified tower media, keeping lossless intermediate files."""
from pathlib import Path
import concurrent.futures
import json
import subprocess
import wave
import array
import math

ROOT=Path(__file__).resolve().parents[1]
VGM=Path(r'F:\4\fluffy-dumper-master-new\fluffy-dumper\vgmstream\bin\windows\vgmstream-cli.exe')
out=ROOT/'sources/audio/wav';out.mkdir(exist_ok=True)
def decode(file):
    target=out/(file.stem+'.wav')
    subprocess.run([str(VGM),'-o',str(target),str(file)],check=True,capture_output=True)
    with wave.open(str(target),'rb') as w:
        assert w.getsampwidth()==2
        rate=w.getframerate();frames=w.getnframes();channels=w.getnchannels()
        values=array.array('h',w.readframes(frames))
    return {'id':int(file.stem),'seconds':round(frames/rate,4),'rate':rate,'channels':channels,
            'peak':round(max(abs(s) for s in values)/32768,4),
            'rms':round(math.sqrt(sum(s*s for s in values)/len(values))/32768,4)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    files={file.stem:file for folder in ('wem','mortar_wem') for file in (ROOT/'sources/audio'/folder).glob('*.wem')}
    records=list(pool.map(decode,files.values()))
(ROOT/'sources/audio/decoded.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
print(f'Decoded {len(records)} files, {sum(r["seconds"] for r in records):.1f} seconds')
trace=json.loads((ROOT/'sources/audio/event_trace.json').read_text('utf-8'))
stats={r['id']:r for r in records}
for e in trace['events']:
    if e['event'].endswith(('build','passby')):continue
    print(e['event'])
    groups={}
    for s in e['sounds']:
        groups.setdefault(tuple(s['chain'][2:-1]),[]).append(s['mediaId'])
    for path,ids in groups.items():
        print(' ',path,[(i,stats[i]['seconds'],stats[i]['rms']) for i in ids])
