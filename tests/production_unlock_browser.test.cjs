const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1540,height:1120}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(root,'dist/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
 async function card(type){await page.locator(`[data-deck-page="${[0,8].includes(type)?3:2}"]`).click();await page.locator(`[data-production-type="${type}"]`).click();}
 async function cell(x,y){const p=await page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};},{x,y});await page.mouse.click(p.x,p.y);}
 await card(0);assert.match(await page.locator('#productionUnlock').textContent(),/待解锁.*0 \/ 50/);
 for(const id of ['item_iron_ore','item_iron_nugget','item_iron_cmpt'])assert(await page.locator(`#productionOption option[value="${id}"]`).isDisabled());
 assert.equal(await page.locator('#warehouseItems b').evaluateAll(xs=>xs.filter(x=>x.textContent==='∞').length),2);assert.equal(await page.locator('#warehouseItems .locked').count(),3);
 await cell(1,10);await cell(1,10);
 await page.locator('#productionOption').evaluate(select=>{select.value='item_iron_ore';select.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.locator('#productionOption').inputValue(),'item_originium_ore');assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(1,10).source),'item_originium_ore');assert.match(await page.locator('#status').textContent(),/未解锁/);
 await card(2);assert(await page.locator('#productionOption option[value="furnance_iron_nugget_1"]').isDisabled());assert(!(await page.locator('#productionOption option[value="furnance_quartz_glass_1"]').isDisabled()));
 await card(5);assert.match(await page.locator('#productionState').textContent(),/未解锁/);await page.screenshot({path:path.join(root,'reports/production_unlock_locked.png')});
 checks.push('initial UI shows the kill requirement, two unlimited raw materials and the locked iron branch; both selection UI and model reject locked configuration');
 await page.evaluate(()=>{BlueprintDefense.reset();const g=BlueprintDefense.game;for(const [type,y] of [[0,10],[1,9],[2,8],[1,7],[3,6]])g.deployProduction(type,1,y,3);const plan=[[0,5,3],[2,7,3],[1,7,6],[4,11,6],[5,7,0],[6,5,6],[8,12,2],[3,14,0]];let next=0;g.start();for(let i=0;i<12000&&g.phase==='running'&&g.kills<50;i++){while(next<plan.length&&g.dp>=g.config.towers[plan[next][0]].cost)g.deploy(...plan[next++]);if(next===plan.length)for(const t of g.towers)if(!g.config.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);g.step(.05);}g.togglePause();BlueprintDefense.updateUI();});
 assert((await page.evaluate(()=>BlueprintDefense.game.kills))>=50);assert.match(await page.locator('#productionUnlock').textContent(),/已解锁.*无限供应/);
 await card(0);assert(!(await page.locator('#productionOption option[value="item_iron_ore"]').isDisabled()));assert.equal(await page.locator('#warehouseItems .locked').count(),0);
 // Unlocking grants access, not free DP: let the existing starter line fund all four machines.
 await page.evaluate(()=>{const g=BlueprintDefense.game;g.togglePause();for(let i=0;i<400&&g.dp<18;i++)g.step(.05);g.togglePause();BlueprintDefense.updateUI();});assert((await page.evaluate(()=>BlueprintDefense.game.dp))>=18);
 await page.locator('#productionOption').selectOption('item_iron_ore');await cell(3,10);await card(2);await page.locator('#productionOption').selectOption('furnance_iron_nugget_1');await cell(3,9);await card(5);await cell(3,8);await card(3);await cell(3,7);await cell(3,7);
 assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.filter(p=>p.x===3).length),4);
 assert.match(await page.locator('#recipePreview').textContent(),/蓝铁块 → 6 DP/);assert.match(await page.locator('#recipePreview').textContent(),/铁制零件 → 10 DP/);
 await page.evaluate(()=>{const g=BlueprintDefense.game;g.togglePause();g.advance(9);g.togglePause();BlueprintDefense.updateUI();});assert((await page.evaluate(()=>BlueprintDefense.game.productionAt(3,7).delivered))>=1,JSON.stringify(await page.evaluate(()=>{const g=BlueprintDefense.game;return {phase:g.phase,dp:g.dp,kills:g.kills,units:g.production.filter(p=>p.x===3).map(p=>({...p,status:g.productionStatus(p)}))};})));
 await cell(3,10);assert.equal(await page.locator('#productionOption').inputValue(),'item_iron_ore');assert.match(await page.locator('#productionOption option:checked').textContent(),/∞/);
 await page.screenshot({path:path.join(root,'reports/production_unlock_open.png')});checks.push('a real affordable defense earns 50 kills, the existing page unlocks instantly, and the selected iron chain actually produces higher-value parts');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(root,'reports/production_unlock_phone.png'),fullPage:true});
 await page.locator('#resetBtn').click();await card(0);assert.match(await page.locator('#productionUnlock').textContent(),/待解锁.*0 \/ 50/);assert.equal(await page.locator('#productionOption').inputValue(),'item_originium_ore');assert(await page.locator('#productionOption option[value="item_iron_ore"]').isDisabled());
 await page.locator('#scenario').selectOption('boss');assert.match(await page.locator('#productionUnlock').textContent(),/待解锁.*0 \/ 50/);assert.equal(await page.locator('#dp').textContent(),'500');checks.push('progression fits phone width; replay and boss practice clear the prior unlock and saved build selection');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'reports/production_unlock_browser_checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
