const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
  async function cell(x,y){const p=await page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};},{x,y});await page.mouse.click(p.x,p.y);}
  await page.locator('#scenario').selectOption('boss');await page.locator('#board').click({position:{x:10,y:10}});await page.keyboard.press('9');
  assert.equal(await page.evaluate(()=>BlueprintDefense.choice),8);assert.equal(await page.locator('.unit-card:visible').count(),5);await cell(12,2);await cell(12,2);
  assert.equal(await page.locator('#detailName').textContent(),'重锤迫击炮');assert.equal(await page.locator('#dp').textContent(),'468');assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.length),0);
  assert.match(await page.locator('#upgradeBtn').textContent(),/维什戴尔改件.*64 DP/);await page.locator('#upgradeBtn').click();await page.waitForFunction(()=>BlueprintDefense.sound.state==='ready');
  assert.equal(await page.locator('#detailDamage').textContent(),'33000');assert.equal(await page.locator('#dp').textContent(),'404');assert(await page.locator('#upgradeBtn').isDisabled());
  assert.equal(await page.locator('[data-type="8"] .owned-count').textContent(),'×1');await page.locator('#detailImage').evaluate(x=>x.decode());
  await page.waitForFunction(()=>BlueprintDefense.sound.counts['wisadel.deploy']===1);await page.screenshot({path:path.join(root,'reports/wisadel_refit.png')});
  checks.push('shortcut 9 deploys the real mortar; a UI refit spends 64 DP, shows 33000 damage and plays the deployment voice once');
  const result=await page.evaluate(()=>{
   const g=BlueprintDefense.game,s=BlueprintDefense.sound,t=g.towers[0],e=g.spawn(0,10000);e.progress=14;Object.assign(e,g.point(e.progress));s.stopAll();g.drainAudioEvents();
   const before=s.counts['wisadel.attack']||0,seen=[];
   for(let i=0;i<9;i++){
    g.fire(t,g.stats(t),e);s.consume(g.drainAudioEvents(),true,g.time);
    const active=[...s.voices].filter(v=>v.dialogue);if(active.length!==1)throw Error('stacked dialogue');seen.push(s.buffers.get('wisadel.attack').indexOf(active[0].source.buffer));
    g.updateProjectiles(1.25);s.consume(g.drainAudioEvents(),true,g.time);
   }
   g.fire(t,g.stats(t),e);g.updateProjectiles(.45);s.consume(g.drainAudioEvents(),true,g.time);BlueprintDefense.updateUI();BlueprintDefense.render();
   return {before,played:s.counts['wisadel.attack']-before,seen,rates:[...s.voices].map(v=>v.source.playbackRate.value)};
  });
  assert.deepEqual(result.seen,[0,1,2,3,4,5,6,7,0]);assert.equal(result.played,10);assert(result.rates.every(r=>r===1));await page.screenshot({path:path.join(root,'reports/wisadel_shell.png')});
  checks.push('each launch plays one of eight transformed battle lines, cycles without repetition, and replaces previous dialogue instead of stacking');
  await page.evaluate(()=>{const s=BlueprintDefense.sound;for(let i=0;i<30;i++){s.lastPlayed.clear();s.play('rocket.fire',8);}if([...s.voices].filter(v=>v.dialogue).length!==1)throw Error('SFX evicted dialogue');});
  assert.equal(await page.evaluate(()=>BlueprintDefense.sound.voices.size),18);await page.locator('#speedBtn').click();assert.equal(await page.evaluate(()=>[...BlueprintDefense.sound.voices].every(v=>v.source.playbackRate.value===1)),true);
  await page.locator('#startBtn').click();await page.locator('#startBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.sound.voices.size),0);
  await page.locator('#soundBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.sound.muted),true);
  const count=await page.evaluate(()=>BlueprintDefense.sound.played);await page.evaluate(()=>{const g=BlueprintDefense.game,s=BlueprintDefense.sound;g.time+=9;g.fire(g.towers[0],g.stats(g.towers[0]),g.enemies[0]);s.consume(g.drainAudioEvents(),true,g.time);});assert.equal(await page.evaluate(()=>BlueprintDefense.sound.played),count);
  checks.push('dialogue survives the effects voice cap; 2x speed does not repitch clips; pause and mute stop and suppress all voice playback');
  await page.setViewportSize({width:390,height:844});await cell(12,2);assert.match(await page.locator('#detailName').textContent(),/维什戴尔改件/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(root,'reports/wisadel_phone.png')});await page.locator('#withdrawBtn').click();assert.equal(await page.locator('#dp').textContent(),'452');assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.length),0);
  await page.locator('#resetBtn').click();await page.locator('[data-deck-page="3"]').click();await page.locator('[data-production-type="0"]').click();await cell(2,10);assert.equal(await page.evaluate(()=>BlueprintDefense.game.production[0].type),0);assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.length),0);
  checks.push('the refit inspector fits a phone, refund includes its cost, and adding a ninth tower does not change warehouse-card deployment');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'reports/mortar_browser_checks.json'),JSON.stringify({passed:checks.length,checks,result,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,result,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
