const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(root,'dist/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
 async function cell(x,y){const p=await page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};},{x,y});await page.mouse.click(p.x,p.y);}
 async function card(type){await page.locator(`[data-deck-page="${[0,8].includes(type)?3:2}"]`).click();await page.locator(`[data-production-type="${type}"]`).click();}
 async function tick(seconds){await page.evaluate(seconds=>{const g=BlueprintDefense.game;if(g.phase==='ready')g.start();else if(g.phase==='paused')g.togglePause();g.advance(seconds);if(g.phase==='running')g.togglePause();BlueprintDefense.updateUI();},seconds);}
 await card(0);assert.equal(await page.locator('#productionOption option').count(),8);await page.locator('#productionOption').selectOption('item_originium_ore');await cell(1,10);
 await page.locator('#productionOption').selectOption('item_quartz_sand');await cell(2,10);await cell(3,10);
 await cell(1,10);assert.equal(await page.locator('#selectionTag').textContent(),'产线 · 已部署');assert.equal(await page.locator('#productionOption').inputValue(),'item_originium_ore');assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.length),3);
 await tick(3.2);assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(1,10).cargo.kind),'item_originium_ore');await page.locator('#productionOption').selectOption('item_quartz_sand');
 assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(1,10).cargo),null);assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(2,10).source),'item_quartz_sand');assert.match(await page.locator('#status').textContent(),/退回仓库/);
 await card(2);await page.locator('#productionOption').selectOption('furnance_quartz_glass_1');await cell(5,9);await cell(5,9);assert.equal(await page.locator('#productionOption').inputValue(),'furnance_quartz_glass_1');await page.locator('#productionOption').selectOption('furnance_crystal_shell_1');
 await card(0);await cell(5,9);assert.equal(await page.locator('#detailName').textContent(),'精炼炉');assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.length),4);
 await cell(2,11);assert(!(await page.locator('#productionOption').isVisible()));assert.match(await page.locator('#status').textContent(),/取货口选择物品/);
 checks.push('item and recipe selectors work before construction and on existing devices without Escape; buffered items can be changed and each port keeps its own setting');
 await page.locator('#resetBtn').click();await card(0);await page.locator('#productionOption').selectOption('item_originium_ore');await cell(1,10);
 for(const [type,y] of [[1,9],[2,8],[1,7],[3,6]]){await card(type);if(type===2){await page.locator('#productionOption').selectOption('furnance_crystal_shell_1');await page.keyboard.press('r');}if(type===1&&y===7){await page.keyboard.press('r');await page.keyboard.press('r');await page.keyboard.press('r');}await cell(1,y);}
 await cell(1,8);assert.equal(await page.locator('#detailRange').textContent(),'左 / 右');await page.locator('#startBtn').click();await page.keyboard.press('Space');await tick(12);assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionEarned),0);
 await cell(1,8);assert.match(await page.locator('#productionState').textContent(),/入口朝向不匹配/);await page.keyboard.press('r');await page.keyboard.press('r');await page.keyboard.press('r');assert.equal(await page.locator('#detailRange').textContent(),'下 / 上');
 await tick(9);assert((await page.evaluate(()=>BlueprintDefense.game.productionEarned))>=8);assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(1,8).dir),3);
 await page.evaluate(()=>{const c=BlueprintDefense.camera;c.zoom=2.3;c.cx=3;c.cy=9.5;c.layout();syncCamera();});await cell(1,8);await page.screenshot({path:path.join(root,'reports/production_ports_fixed.png')});
 checks.push('an actual user-built upward line stops at the sideways refinery, reports the wrong inlet, and resumes after rotating that selected device');
 await card(0);await cell(3,10);await cell(3,10);await page.keyboard.press('r');assert.match(await page.locator('#productionState').textContent(),/仓库接口朝向不匹配/);await tick(5);assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(3,10).cargo),null);
 for(let i=0;i<3;i++)await page.keyboard.press('r');await page.locator('#productionOption').selectOption('item_originium_ore');await tick(3.1);assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(3,10).cargo.kind),'item_originium_ore');
 await page.screenshot({path:path.join(root,'reports/production_config_desktop.png')});
 checks.push('warehouse direction mismatch is visible in the inspector and prevents withdrawal until rotated back; the original port artwork follows the same direction');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#productionOption').selectOption('item_quartz_sand');assert.equal(await page.locator('#productionOption').inputValue(),'item_quartz_sand');await page.screenshot({path:path.join(root,'reports/production_config_phone.png'),fullPage:true});
 checks.push('recipe and item configuration remain usable on phone width');assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(root,'reports/production_config_browser_checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
