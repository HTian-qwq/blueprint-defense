"""Current full-size map regression entry point; prior coordinate fixtures are historical."""
import hashlib, json, re, subprocess, sys
from pathlib import Path
from runtime import node_environment
ROOT=Path(__file__).resolve().parents[1]
NODE,env=node_environment(ROOT)
(ROOT/'reports').mkdir(exist_ok=True)
if not (ROOT/'dist/blueprint_defense.html').is_file():
    raise SystemExit('Run python tools/build.py before running the test suite.')
results=[]
for name in ['industrial','blue_iron_browser','industrial_browser','hotbar_browser','placement','placement_browser','bulk','bulk_browser','original_bulk_browser','economy','economy_campaign','geometry','burst','audio_mapping','mortar','actor_facing','wave_preparation','geometry_browser','actor_facing_browser','wave_preparation_browser','economy_browser','currency_browser']:
    run=subprocess.run([NODE,str(ROOT/f'tests/{name}.test.cjs')],cwd=ROOT,env=env,capture_output=True,text=True,encoding='utf-8',timeout=180)
    output=run.stdout+run.stderr
    results.append({'suite':name,'returncode':run.returncode,'output':output})
    print(name, 'PASS' if run.returncode==0 else 'FAIL',flush=True)
    if run.returncode:print(output)
belts=subprocess.run([sys.executable,str(ROOT/'tests/belt_assets.test.py')],cwd=ROOT,env=env,capture_output=True,text=True,encoding='utf-8',timeout=60)
results.append({'suite':'belt_assets','returncode':belts.returncode,'output':belts.stdout+belts.stderr})
print('belt_assets', 'PASS' if belts.returncode==0 else 'FAIL',flush=True)
report={'version':'0.17','passed':sum(int(re.search(r'"passed":\s*(\d+)',r['output']).group(1)) for r in results if r['returncode']==0 and r['suite']!='belt_assets'),'beltOrientations':12 if belts.returncode==0 else 0,'suites':results,'buildSha256':hashlib.sha256((ROOT/'dist/blueprint_defense.html').read_bytes()).hexdigest()}
(ROOT/'reports/v17_verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
assert all(r['returncode']==0 for r in results)
print('Passed',report['passed'],'checks and',report['beltOrientations'],'belt orientations')
