const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[],checks=[];
    page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
    await page.locator('.unit-card img').evaluateAll(xs=>Promise.all(xs.map(x=>x.decode())));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true,'desktop controls should fit without scrolling');
    await fs.mkdir(path.join(root,'reports'),{recursive:true});
    async function clickCell(x,y){const p=await page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};},{x,y});await page.mouse.click(p.x,p.y);}
    await page.locator('[data-type="0"]').click();await clickCell(4,5);assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.length),0);
    await clickCell(5,3);assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.length),1);assert.equal(await page.locator('#dp').textContent(),'31');
    await page.keyboard.press('Escape');await clickCell(5,3);assert.equal(await page.locator('#detailName').textContent(),'铳械塔');
    checks.push('real mouse deployment, blocked path, DP deduction and tower inspection');
    await page.locator('#upgradeBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers[0].level),2);
    await page.locator('#withdrawBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.length),0);assert.equal(await page.locator('#dp').textContent(),'31');
    checks.push('upgrade and withdraw buttons update the actual simulation and refund');
    await page.locator('#resetBtn').click();await page.keyboard.press('1');await clickCell(5,3);await clickCell(7,3);await page.locator('#startBtn').click();
    assert.equal(await page.evaluate(()=>BlueprintDefense.game.phase),'running');await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>BlueprintDefense.game.phase),'paused');
    const time=await page.evaluate(()=>BlueprintDefense.game.time);await page.waitForTimeout(220);assert.equal(await page.evaluate(()=>BlueprintDefense.game.time),time);
    await page.locator('#speedBtn').click();assert.equal(await page.locator('#speedBtn').textContent(),'2×');
    checks.push('start, space pause, clock freeze and speed controls');
    await page.locator('#helpBtn').click();assert(await page.locator('#help').isVisible());await page.keyboard.press('Escape');assert(!(await page.locator('#help').isVisible()));
    checks.push('operation manual opens and closes without changing paused simulation');
    await page.evaluate(()=>{const g=BlueprintDefense.game;g.togglePause();g.advance(20);BlueprintDefense.updateUI();BlueprintDefense.render();});
    await page.screenshot({path:path.join(root,'reports/battle_desktop.png')});
    await page.evaluate(()=>{const g=BlueprintDefense.game;g.togglePause();BlueprintDefense.updateUI();});
    await page.setViewportSize({width:780,height:1000});await page.waitForTimeout(120);
    assert(await page.locator('#startBtn').isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:path.join(root,'reports/battle_compact.png')});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    checks.push('compact and phone layouts avoid horizontal overflow');
    await page.setViewportSize({width:1540,height:1060});await page.locator('#resetBtn').click();
    await page.evaluate(()=>{const g=BlueprintDefense.game;g.start();g.advance(400);BlueprintDefense.updateUI();});
    assert.equal(await page.locator('#resultTitle').textContent(),'防线失守');assert(await page.locator('#againBtn').isVisible());await page.locator('#againBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.game.phase),'ready');
    checks.push('defeat result and replay reset work');
    await page.evaluate(()=>{
      const g=BlueprintDefense.game,plan=[[0,5,3],[2,7,3],[1,7,6],[4,11,6],[5,7,0],[6,5,6],[8,12,2],[3,14,0]];let next=0;
      for(const [type,y] of [[0,10],[1,9],[2,8],[1,7],[3,6]]){if(!g.deployProduction(type,1,y,3).unit)throw Error('starter line placement failed');}
      window.finishDemo=(stopAtWave)=>{
        for(let i=0;i<16000&&g.phase==='running';i++){
          while(next<plan.length&&g.dp>=g.config.towers[plan[next][0]].cost){const [kind,x,y]=plan[next++];g.deploy(kind,x,y);}
          if(next===plan.length)for(const t of g.towers)if(!g.config.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);
          g.step(.05);if(stopAtWave!==undefined&&g.wave>=stopAtWave&&g.waveTime>=9)break;
        }BlueprintDefense.updateUI();BlueprintDefense.render();
      };g.start();finishDemo(3);
    });
    await page.screenshot({path:path.join(root,'reports/battle_showcase.png')});
    await page.evaluate(()=>finishDemo());assert.equal(await page.locator('#resultTitle').textContent(),'防守成功');
    assert.equal(await page.evaluate(()=>{const g=BlueprintDefense.game;return g.kills+g.leaked===g.total&&g.total===400+g.reinforcements;}),true);
    await page.screenshot({path:path.join(root,'reports/victory.png')});
    checks.push('a complete affordable match resolves all 400 planned enemies and their reinforcements and reaches the victory UI');
    await page.locator('#againBtn').click();
    await page.screenshot({path:path.join(root,'reports/ready_desktop.png')});
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'reports/browser_checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
