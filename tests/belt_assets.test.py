"""Verify the native tiles cover every direction and the enemy track stays on them."""
import json
from pathlib import Path
import subprocess
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / "tools"))
from runtime import node_environment
from PIL import Image

root = Path(__file__).resolve().parents[1]
script = """
const {makeTrack,beltTiles}=require('./src/engine.js');
const v=[[1,0],[0,1],[-1,0],[0,-1]], result=[];
for(let incoming=0;incoming<4;incoming++)for(let outgoing=0;outgoing<4;outgoing++){
  if((incoming+2)%4===outgoing)continue;
  const path=[{x:1-v[incoming][0],y:1-v[incoming][1]},{x:1,y:1},{x:1+v[outgoing][0],y:1+v[outgoing][1]}];
  result.push({tile:beltTiles(path)[1],track:makeTrack(path).segments});
}console.log(JSON.stringify(result));
"""
node, env = node_environment(root)
rows = json.loads(subprocess.check_output([str(node), '-e', script], cwd=root, env=env))
for row in rows:
    tile = row['tile']
    image = Image.open(root / 'assets' / (tile['sprite'] + '.png')).convert('RGBA').rotate(-tile['angle'])
    alpha = image.getchannel('A')
    for segment in row['track']:
        for point in (segment['a'],segment['b']):
            x,y=point['x']-tile['x'],point['y']-tile['y']
            if not (0<=x<=1 and 0<=y<=1):
                continue
            pixel=(min(image.width-1,round(x*(image.width-1))),min(image.height-1,round(y*(image.height-1))))
            # Native hatch lines and edge antialiasing vary in alpha within a pixel.
            area=alpha.crop((max(0,pixel[0]-1),max(0,pixel[1]-1),min(image.width,pixel[0]+2),min(image.height,pixel[1]+2)))
            assert area.getextrema()[1]>100,(tile,pixel,area.getextrema())
print(f'{len(rows)} native belt orientations: rounded enemy centerline stays on the original belt pixels')
