const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1540,height:1060}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'dist/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
  async function point(x,y){return page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};},{x,y});}
  async function cell(x,y){const p=await point(x,y);await page.mouse.click(p.x,p.y);}
  await page.locator('#scenario').selectOption('boss');await page.locator('[data-type="0"]').click();await cell(9,3);assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.length),0);assert.match(await page.locator('#status').textContent(),/通道重叠/);
  await cell(5,3);await cell(6,4);assert.equal(await page.locator('#detailName').textContent(),'铳械塔');assert.match(await page.locator('#detailRole').textContent(),/2×2/);assert.equal(await page.evaluate(()=>BlueprintDefense.game.towerAt(6,4).id),await page.evaluate(()=>BlueprintDefense.game.towers[0].id));
  await page.locator('[data-deck-page="2"]').click();await page.locator('[data-production-type="1"]').click();await cell(6,4);assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.length),0);assert.equal(await page.locator('#detailName').textContent(),'铳械塔');
  checks.push('a non-anchor road overlap blocks placement, all four tower cells select the same unit, and production cannot overwrite its interior');
  await page.locator('#board').click({position:{x:10,y:10}});await page.keyboard.press('9');assert.match(await page.locator('#placementHint').textContent(),/3×3/);await cell(12,2);await cell(14,4);assert.equal(await page.locator('#detailName').textContent(),'重锤迫击炮');
  await page.locator('#upgradeBtn').click();assert.equal(await page.locator('#detailName').textContent(),'维什戴尔改件');assert.match(await page.locator('#detailRole').textContent(),/3×3/);
  assert.equal(await page.evaluate(()=>document.getElementById('detailImage').src===DATA.wisadel.portrait),true);
  const initialActor=await page.evaluate(()=>{const g=BlueprintDefense.game,c=document.createElement('canvas');c.width=c.height=320;const ctx=c.getContext('2d');BlueprintDefense.actors.draw(ctx,g.towers.find(t=>t.type===8),g.time,{x:60,y:60},50,{width:3,depth:3});return Array.from(ctx.getImageData(0,0,320,320).data).filter((v,i)=>i%4===3&&v>200).length;});assert(initialActor>1000,'the newly installed refit must be visible before simulation starts');
  const decoded=await page.evaluate(()=>{const a=BlueprintDefense.actors,c=document.createElement('canvas');c.width=c.height=480;const ctx=c.getContext('2d');let visible=0,transparent=0;for(const img of a.images.values()){ctx.clearRect(0,0,480,480);ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,480,480).data;for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]>200)visible++;}}return {pages:a.images.size,visible,transparent};});assert.equal(decoded.pages,11);assert(decoded.visible>1000&&decoded.transparent>1000);
  await page.evaluate(()=>{const g=BlueprintDefense.game;g.phase='paused';g.time=3;BlueprintDefense.updateUI();BlueprintDefense.render();});
  await page.screenshot({path:path.join(root,'reports/wisadel_actor_idle.png')});checks.push('the 3x3 refit uses the supplied unchanged portrait and eleven decoded transparent animation atlases');
  const animation=await page.evaluate(()=>{
   const g=BlueprintDefense.game,t=g.towers.find(t=>t.type===8),e=g.spawn(0,10000);e.progress=14;Object.assign(e,g.point(e.progress));g.fire(t,g.stats(t),e);
   const states=[];for(const age of [.1,.4]){g.time=t.lastShotAt+age;BlueprintDefense.render();states.push({name:BlueprintActorPose(DATA.wisadel,t,g.time).name,frame:BlueprintActorPose(DATA.wisadel,t,g.time).frame,pixels:document.getElementById('board').toDataURL()});}
   return states;
  });assert(animation.every(s=>s.name==='attackA'));assert.notEqual(animation[0].frame,animation[1].frame);assert.notEqual(animation[0].pixels,animation[1].pixels);await page.screenshot({path:path.join(root,'reports/wisadel_actor_attack.png')});
  const frozen=await page.evaluate(()=>{BlueprintDefense.render();return document.getElementById('board').toDataURL();});await page.waitForTimeout(160);assert.equal(await page.evaluate(()=>BlueprintActorPose(DATA.wisadel,BlueprintDefense.game.towers.find(t=>t.type===8),BlueprintDefense.game.time).frame),animation[1].frame);
  await page.evaluate(()=>{const g=BlueprintDefense.game,t=g.towers.find(t=>t.type===8);g.disableTower(t,2);BlueprintDefense.render();});assert.equal(await page.evaluate(()=>BlueprintActorPose(DATA.wisadel,BlueprintDefense.game.towers.find(t=>t.type===8),BlueprintDefense.game.time).name),'stun');await page.screenshot({path:path.join(root,'reports/wisadel_actor_stun.png')});
  checks.push('real fire changes visible animation frames; paused simulation freezes the character and suppression selects the supplied stun action');
  await page.setViewportSize({width:390,height:844});await cell(14,4);assert.equal(await page.locator('#detailName').textContent(),'维什戴尔改件');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(root,'reports/wisadel_actor_phone.png')});
  await page.locator('#withdrawBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.game.towerAt(14,4)),undefined);await page.locator('#resetBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.length),0);
  checks.push('large-footprint interior hit testing also works on phones; withdrawal and reset remove the entire animated actor');
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'reports/footprints_browser_checks.json'),JSON.stringify({passed:checks.length,checks,decoded,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,decoded,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
