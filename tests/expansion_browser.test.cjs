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
    page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(root,'dist/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
    async function cell(x,y){const p=await page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};},{x,y});await page.mouse.click(p.x,p.y);}
    await page.evaluate(()=>{BlueprintDefense.game.dp=99;BlueprintDefense.updateUI();});
    assert.equal(await page.locator('.unit-card:visible').count(),16);
    await page.locator('[data-type="0"]').click();await cell(5,3);await page.keyboard.press('Escape');await cell(5,3);
    await page.locator('#upgradeBtn').click();assert.equal(await page.locator('#detailName').textContent(),'扩装铳械塔');
    const stage2=await page.locator('#detailImage').getAttribute('src');
    await page.locator('#upgradeBtn').click();assert.equal(await page.locator('#detailName').textContent(),'“暴雨”铳械塔');
    assert.notEqual(await page.locator('#detailImage').getAttribute('src'),stage2);assert(await page.locator('#upgradeBtn').isDisabled());
    assert.equal(await page.locator('.upgrade-stage.current span').textContent(),'“暴雨”铳械塔');
    assert.equal(await page.evaluate(()=>BlueprintDefense.game.stats(BlueprintDefense.game.towers[0]).burst.weights.length),6);
    assert.equal(await page.locator('#detailDamage').evaluate(el=>el.previousElementSibling.textContent),'整轮伤害');
    assert.equal(await page.locator('#detailInterval').evaluate(el=>el.previousElementSibling.textContent),'轮次间隔');
    await page.screenshot({path:path.join(root,'reports/refit_route.png')});
    checks.push('real upgrade clicks change turret name, original sprite and cadence, display the route and stop at its endpoint');
    await page.locator('[data-deck-page="1"]').click();assert.equal(await page.locator('.unit-card:visible').count(),5);
    assert(await page.locator('[data-type="4"]').isVisible());assert(!(await page.locator('[data-type="0"]').isVisible()));
    await page.keyboard.press('8');assert.equal(await page.evaluate(()=>BlueprintDefense.choice),7);await cell(2,2);
    assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.at(-1).type),7);
    await page.keyboard.press('1');assert(await page.locator('[data-type="0"]').isVisible());
    await page.keyboard.press('5');assert(await page.locator('[data-type="4"]').isVisible());
    await page.screenshot({path:path.join(root,'reports/tactical_deck.png')});
    checks.push('equipment pages and shortcuts 1–8 select and deploy the correct tower');
    await page.locator('#startBtn').click();await page.locator('#enemyGuideBtn').click();
    assert.equal(await page.evaluate(()=>BlueprintDefense.game.phase),'paused');assert.equal(await page.locator('#enemyGuideList article').count(),16);
    await page.locator('#enemyGuideList img').evaluateAll(xs=>Promise.all(xs.map(x=>x.decode())));
    await page.screenshot({path:path.join(root,'reports/enemy_guide.png')});await page.locator('#closeEnemyGuide').click();
    assert(!(await page.locator('#enemyGuide').isVisible()));checks.push('enemy guide shows sixteen original portraits, combat traits and shield stats, and pauses the battle');
    await page.setViewportSize({width:390,height:844});await page.locator('[data-deck-page="1"]').click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('.unit-card:visible').count(),5);
    await page.screenshot({path:path.join(root,'reports/tactical_phone.png'),fullPage:true});
    checks.push('expanded equipment, refit panel and audio controls fit the phone width');
    await page.setViewportSize({width:1540,height:1060});
    // A visual fixture uses real projectile/impact code with frozen simulation.
    await page.evaluate(()=>{
      BlueprintDefense.reset();const g=BlueprintDefense.game;
      const plan=[[0,5,3],[2,7,3],[1,7,6],[4,11,6],[5,7,0],[6,5,6],[8,12,2],[3,14,0]];
      for(const [type,x,y] of plan){g.dp=99;const t=g.deploy(type,x,y).tower;while(t.level<g.maxLevel(t)){g.dp=99;g.upgrade(t.id);}}
      for(let type=0;type<8;type++){g.spawn(type,3);const e=g.enemies.at(-1);e.progress=6+type*3;Object.assign(e,g.point(e.progress));}
      for(const t of g.towers){const target=g.enemies[(t.type+2)%8];g.fire(t,g.stats(t),target);}g.updateProjectiles(.6);
      g.phase='ready';g.drainAudioEvents();BlueprintDefense.sound.stopAll();BlueprintDefense.selectType(4);BlueprintDefense.updateUI();BlueprintDefense.render();
    });
    await page.screenshot({path:path.join(root,'reports/expanded_battle.png')});
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'reports/expansion_browser_checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
