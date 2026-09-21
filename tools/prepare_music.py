"""Re-encode the two verified combat loops; normal builds use prepared MP3s.

Usage: python tools/prepare_music.py --vgmstream PATH --ffmpeg PATH
The original WEM IDs and combat-state bank evidence are in music_provenance.json.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vgmstream',required=True)
    parser.add_argument('--ffmpeg',required=True)
    args=parser.parse_args()
    provenance=json.loads((ROOT/'sources/music_provenance.json').read_text('utf-8'))
    with tempfile.TemporaryDirectory(prefix='blueprint-music-') as directory:
        for track in provenance['tracks']:
            media=track['media']['mediaId']
            source=ROOT/f'sources/music/{media}.wem'
            assert hashlib.sha256(source.read_bytes()).hexdigest()==track['wemSha256']
            wav=Path(directory)/f'{media}.wav'
            subprocess.run([args.vgmstream,'-o',str(wav),str(source)],check=True)
            duration=track['duration']
            filters=f'loudnorm=I=-20:TP=-2:LRA=11,afade=t=in:d=0.04,afade=t=out:st={duration-.08}:d=0.08'
            target=ROOT/track['file']
            subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(wav),'-af',filters,
                '-t',str(duration),'-ar','44100','-ac','2','-c:a','libmp3lame','-b:a','128k','-map_metadata','-1',str(target)],check=True)
            track['mp3Sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
    (ROOT/'sources/music_provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__=='__main__':
    main()
