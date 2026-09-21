const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1540,height:1060}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
  await page.locator('#enemyGuideBtn').click();assert.equal(await page.locator('#enemyGuideList article').count(),16);
  await page.locator('#enemyGuideList img').evaluateAll(xs=>Promise.all(xs.map(x=>x.decode())));
  const last=await page.locator('#enemyGuideList article').allTextContents();assert(last[13].includes('重刺天使'));assert(last[14].includes('劫云客'));assert(last[15].includes('焚雾源石虫'));assert(last.slice(13).every(t=>t.includes('同人')));
  await page.locator('#enemyGuideList article').last().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'reports/enemy_pressure_guide.png')});await page.locator('#closeEnemyGuide').click();
  checks.push('all sixteen original portraits decode and the three new guide entries explain their fan mechanics');
  // Visual fixture exercises actual skill code; it is not an unaided playthrough.
  const fixture=await page.evaluate(()=>{
   BlueprintDefense.reset();const g=BlueprintDefense.game;g.phase='paused';g.wave=7;g.time=3;g.spawned=g.config.waves[7].enemies.length;
   function enemy(type,progress){const e=g.spawn(type,1);e.progress=progress;Object.assign(e,g.point(progress));e.nextCast=3;return e;}
   const s=enemy(13,7),h=enemy(14,14),a=enemy(0,14.4),w=enemy(5,21),b=enemy(0,21.5),bomb=enemy(15,29);a.hp=a.maxHp*.5;
   g.deploy(0,14,6);g.damage({type:0,kills:0},bomb,1e8,true);g.updateEnemyAbilities();
   window.pressureLabels=[];const ctx=document.getElementById('board').getContext('2d'),original=ctx.fillText.bind(ctx);ctx.fillText=(s,...args)=>{pressureLabels.push(String(s));return original(s,...args);};
   BlueprintDefense.updateUI();BlueprintDefense.render();return {kinds:[s.cast.kind,h.cast.kind,w.cast.kind],hazards:g.enemyHazards.length,labels:pressureLabels};
  });
  assert.deepEqual(fixture.kinds,['summon','heal','ward']);assert.equal(fixture.hazards,1);
  for(const label of ['召唤','治疗','护盾','爆破'])assert(fixture.labels.some(s=>s.includes(label)),label+' warning must be drawn');
  assert.match(await page.locator('#waveThreats').textContent(),/召唤.*治疗.*护盾.*爆破/);
  await page.screenshot({path:path.join(root,'reports/enemy_pressure_warnings.png')});checks.push('real summon, healing, shielding and delayed explosion code renders distinct countdown warnings and wave counterplay hints');
  const before=await page.evaluate(()=>JSON.stringify(BlueprintDefense.game));await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>JSON.stringify(BlueprintDefense.game)),before);
  await page.evaluate(()=>{const g=BlueprintDefense.game;g.time=4.2;g.updateEnemyAbilities();BlueprintDefense.updateUI();BlueprintDefense.render();});
  assert.match(await page.locator('#nextLabel').textContent(),/60 个 \+2 援军/);assert.equal(await page.evaluate(()=>BlueprintDefense.game.total),402);assert.match(await page.locator('#kills').textContent(),/402/);
  await page.screenshot({path:path.join(root,'reports/enemy_pressure_reinforcements.png')});checks.push('pause freezes skill warnings and real summoned enemies update both wave and battle totals');
  await page.locator('#resetBtn').click();assert.deepEqual(await page.evaluate(()=>{const g=BlueprintDefense.game;return [g.total,g.reinforcements,g.enemyHazards.length,g.enemies.length,g.kills];}),[400,0,0,0,0]);
  await page.setViewportSize({width:390,height:844});await page.locator('#enemyGuideBtn').click();await page.locator('#enemyGuideList article').last().scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(root,'reports/enemy_pressure_phone.png')});checks.push('restart clears reinforcements and pending hazards; new guide entries fit a phone viewport');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'reports/enemy_pressure_browser_checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
