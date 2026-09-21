const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
  async function cell(x,y){const p=await page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};},{x,y});await page.mouse.click(p.x,p.y);}
  await page.locator('[data-deck-page="3"]').click();assert.equal(await page.locator('.unit-card:visible').count(),2);
  await page.locator('[data-production-type="0"]').click();await page.keyboard.press('r');assert.match(await page.locator('#rotateBtn').textContent(),/向右/);await page.keyboard.press('r');await page.keyboard.press('r');await page.keyboard.press('r');await cell(2,10);
  await page.keyboard.press('Escape');await cell(2,10);await page.locator('#productionOption').selectOption('item_quartz_sand');assert.match(await page.locator('#recipePreview').textContent(),/紫晶矿/);await page.locator('#productionOption').selectOption('item_originium_ore');
  await page.locator('[data-deck-page="2"]').click();assert.equal(await page.locator('.unit-card:visible').count(),5);
  for(const [type,y] of [[1,9],[2,8],[1,7],[3,6]]){await page.locator(`[data-production-type="${type}"]`).click();await cell(2,y);}
  assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.length),5);assert.equal(await page.locator('#dp').textContent(),'27');
  await page.keyboard.press('Escape');await cell(2,8);assert.equal(await page.locator('#productionOption option').count(),3);
  await page.locator('#productionOption').selectOption('furnance_quartz_glass_1');assert.match(await page.locator('#recipePreview').textContent(),/紫晶矿.*2s.*紫晶纤维/);await page.locator('#productionOption').selectOption('furnance_crystal_shell_1');
  await cell(2,9);await page.keyboard.press('r');assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(2,9).dir),0);await page.locator('#rotateBtn').click();await page.locator('#rotateBtn').click();await page.locator('#rotateBtn').click();
  await page.locator('#withdrawBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.length),4);assert.equal(await page.locator('#dp').textContent(),'28');
  await page.locator('[data-production-type="1"]').click();await cell(2,9);await page.keyboard.press('Escape');
  checks.push('warehouse and production cards, preview and placed rotation, real mineral/recipe selectors and full refund work through mouse/keyboard');
  await page.keyboard.press('1');await cell(5,3);await cell(7,3);await page.locator('#startBtn').click();await page.keyboard.press('Space');
  await page.evaluate(()=>{const g=BlueprintDefense.game;g.togglePause();g.advance(10);g.togglePause();BlueprintDefense.updateUI();});
  assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionEarned),8);assert.equal(await page.locator('#dp').textContent(),'17');assert.match(await page.locator('#productionIncome').textContent(),/8/);
  const frozen=await page.evaluate(()=>JSON.stringify(BlueprintDefense.game.production));await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>JSON.stringify(BlueprintDefense.game.production)),frozen);
  await page.locator('[data-deck-page="2"]').click();await cell(2,8);assert.match(await page.locator('#productionState').textContent(),/暂停/);
  await page.screenshot({path:path.join(root,'reports/production_paused.png')});
  await page.keyboard.press('Space');await page.waitForTimeout(220);await page.screenshot({path:path.join(root,'reports/production_live.png')});await page.keyboard.press('Space');
  checks.push('a user-built 13 DP warehouse line produces real items and 8 DP, displays income/state, and freezes with the battle');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(root,'reports/production_phone.png'),fullPage:true});
  checks.push('production cards and recipe inspection fit phone width');
  await page.setViewportSize({width:1540,height:1060});await page.locator('#scenario').selectOption('boss');assert.equal(await page.locator('#dp').textContent(),'500');assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.length),0);assert.equal(await page.evaluate(()=>BlueprintDefense.game.total),64);
  await page.evaluate(()=>{
    const g=BlueprintDefense.game;for(const pos of [[0,5,3],[2,7,3],[1,7,6],[4,11,6],[5,7,0],[6,5,6],[8,12,2],[3,14,0]]){const t=g.deploy(...pos).tower;while(!g.config.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);}
    g.start();for(let i=0;i<2000&&!g.boss;i++)g.step(.05);g.togglePause();BlueprintDefense.updateUI();
  });
  assert(await page.locator('#bossPanel').isVisible());assert.match(await page.locator('#bossPhase').textContent(),/PHASE 01/);assert.match(await page.locator('#bossName').textContent(),/罗丹/);
  await page.evaluate(()=>{const g=BlueprintDefense.game,b=g.boss;g.damage(g.towers[0],b,b.hp-b.maxHp/2,true);g.time=b.nextCast;g.updateEnemyAbilities();BlueprintDefense.updateUI();});
  assert.match(await page.locator('#bossPhase').textContent(),/PHASE 02/);assert.match(await page.locator('#bossAbility').textContent(),/火焰冲击.*后命中/);assert.match(await page.locator('#bossNumbers').textContent(),/护盾/);
  // Real cast/renderer fixture: leave the simulation running for the screenshot.
  await page.evaluate(()=>{BlueprintDefense.game.togglePause();BlueprintDefense.updateUI();});await page.waitForTimeout(150);await page.screenshot({path:path.join(root,'reports/rodin_phase2.png')});await page.evaluate(()=>{BlueprintDefense.game.togglePause();BlueprintDefense.updateUI();});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(root,'reports/rodin_phone.png'),fullPage:true});
  checks.push('the two-wave practice resets production, spawns original Rodin portrait and shows phase-two shield, ability telegraph and responsive boss HUD');
  await page.locator('#resetBtn').click();assert(!(await page.locator('#bossPanel').isVisible()));assert.equal(await page.locator('#dp').textContent(),'500');await page.locator('#scenario').selectOption('campaign');assert.equal(await page.locator('#dp').textContent(),'40');
  checks.push('replay keeps the selected scenario, clears the boss, and campaign restores its production economy');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'reports/production_browser_checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
