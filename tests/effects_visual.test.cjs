// Isolated visual fixture: exercise all effect phases without touching user gameplay.
const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
    await page.evaluate(()=>{
      const g=BlueprintDefense.game,places=[[3,4],[7,3],[11,5],[15,7]],targets=[[3.5,5.5],[7.5,2.5],[10.5,5.5],[15.5,8.5]];
      for(let i=0;i<4;i++){g.dp=99;const t=g.deploy(i,...places[i]).tower;g.spawn(i,10);const e=g.enemies.at(-1);[e.x,e.y]=targets[i];g.fire(t,g.stats(t),e);}
      g.updateProjectiles(.07);BlueprintDefense.updateUI();document.getElementById('boardNote').textContent='特效检查 · 能量弹 / 榴弹抛物线 / 液氮晶体 / 电磁蓄能';BlueprintDefense.render();
    });
    await page.screenshot({path:path.join(root,'reports/effects_flight.png')});
    await page.evaluate(()=>{
      const g=BlueprintDefense.game;g.updateProjectiles(.6);for(const e of g.effects)e.ttl=e.total*.6;
      document.getElementById('boardNote').textContent='特效检查 · 命中火花 / 灼热爆炸 / 冷雾冰晶 / 贯穿电弧';BlueprintDefense.render();
    });
    await page.screenshot({path:path.join(root,'reports/effects_impact.png')});
    assert.deepEqual(errors,[]);console.log('All four original effect renderers: flight and impact phases rendered without errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
