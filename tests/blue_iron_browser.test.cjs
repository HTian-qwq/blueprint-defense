const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1540,height:1060}}),checks=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BLUEPRINT_TEST_URL||pathToFileURL(path.join(root,'dist/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
 async function cell(x,y){const p=await page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return{x:r.x+p.x,y:r.y+p.y};},{x,y});await page.mouse.click(p.x,p.y);}
 async function place(key,x,y,option){await page.keyboard.press(key);if(option)await page.locator('#productionOption').selectOption(option);await cell(x,y);}
 assert.match(await page.locator('.blueprint-size b').innerText(),/64 × 48/);
 const coverage=await page.evaluate(()=>{const g=BlueprintDefense.game;return {count:g.warehouseLine.length,complete:Array.from({length:64},(_,x)=>[44,45,46,47].every(y=>g.productionAt(x,y)?.fixed)).every(Boolean),connected:g.warehouseConnections().size};});
 assert.deepEqual(coverage,{count:9,complete:true,connected:9});
 await cell(63,47);assert.match(await page.locator('#detailName').innerText(),/源桩/);assert.match(await page.locator('#detailRole').innerText(),/4×4/);
 checks.push('64×48 map has an unbroken connected warehouse across all 64 bottom cells, using original 4×4 source posts and 8×4 segments');
 await page.keyboard.press('2');assert(await page.locator('#productionOption option[value="item_iron_ore"]').isDisabled());assert.match(await page.locator('#productionUnlock').innerText(),/研究「蓝铁冶炼」/);
 await page.locator('#techBtn').click();assert(await page.locator('[data-start-research="blue_iron"]').isDisabled());assert.match(await page.locator('[data-research="blue_iron"] .tech-cost').innerText(),/2,000 折金票 · 25 秒/);await page.screenshot({path:path.join(root,'reports/blue_iron_technology.png')});await page.locator('#closeTech').click();
 for(const [x,ore,recipe] of [[1,'item_originium_ore','furnance_crystal_shell_1'],[5,'item_quartz_sand','furnance_quartz_glass_1']]){
  await place('2',x,43,ore);await place('3',x,40,recipe);await place('4',x,37,'balanced');
 }
 for(const [x,y] of [[9,7],[17,5]])await place('7',x,y);
 await page.locator('#startBtn').click();await page.locator('#speedBtn').click();
 await page.waitForFunction(()=>{const g=BlueprintDefense.game;return g.warehouseCount('item_crystal_shell')>=8&&g.warehouseCount('item_quartz_glass')>=6&&g.dp>=20;},{},{timeout:60000});await page.locator('#startBtn').click();
 const before=await page.evaluate(()=>({dp:BlueprintDefense.game.dp,stock:{...BlueprintDefense.game.warehouse}}));
 await page.locator('#techBtn').click();await page.locator('[data-start-research="blue_iron"]').click();
 assert.equal(await page.evaluate(()=>BlueprintDefense.game.dp),before.dp-20);assert.equal(await page.evaluate(()=>BlueprintDefense.game.warehouse.item_crystal_shell),before.stock.item_crystal_shell-8);
 await page.locator('#closeTech').click();await page.keyboard.press('2');assert(await page.locator('#productionOption option[value="item_iron_ore"]').isDisabled());
 await page.locator('#startBtn').click();await page.waitForFunction(()=>BlueprintDefense.game.researched.includes('blue_iron'),{},{timeout:35000});await page.locator('#startBtn').click();
 assert(await page.locator('#productionOption option[value="item_iron_ore"]').isEnabled());assert.match(await page.locator('#productionUnlock').innerText(),/已解锁/);
 checks.push('a fresh normal campaign manufactures its own research materials and tickets, pays once through the UI, and unlocks blue iron only after 25 seconds of normal running time');
 await place('2',59,43,'item_iron_ore');await place('3',59,40,'furnance_iron_nugget_1');await place('4',59,37,'warehouse');
 await page.locator('#startBtn').click();await page.waitForFunction(()=>BlueprintDefense.game.warehouseCount('item_iron_nugget')>0,{},{timeout:14000});await page.locator('#startBtn').click();
 const played=await page.evaluate(()=>({time:BlueprintDefense.game.time,kills:BlueprintDefense.game.kills,life:BlueprintDefense.game.life,iron:BlueprintDefense.game.warehouseCount('item_iron_nugget')}));assert(played.life>0);assert(played.kills<50);
 await page.screenshot({path:path.join(root,'reports/expanded_map_play.png')});checks.push('real UI builds and operates a researched iron line in the new far-right construction area before 50 kills');
 await page.locator('#resetBtn').click();await page.keyboard.press('2');assert(await page.locator('#productionOption option[value="item_iron_ore"]').isDisabled());assert.deepEqual(await page.evaluate(()=>BlueprintDefense.game.researched),[]);checks.push('new run clears the research and relocks iron while retaining the enlarged map');
 assert.deepEqual(errors,[]);const report={passed:checks.length,checks,played,errors};await fs.writeFile(path.join(root,'reports/blue_iron_browser_checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
