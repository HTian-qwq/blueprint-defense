const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
 // This scenario verifies the logistics chain after progression has been unlocked.
 await page.evaluate(()=>{const g=BlueprintDefense.game;g.kills=Math.max(...g.config.production.unlocks.map(r=>r.kills));BlueprintDefense.updateUI();});
 async function cell(x,y){const p=await page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};},{x,y});await page.mouse.click(p.x,p.y);}
 await page.locator('[data-deck-page="3"]').click();assert.equal(await page.locator('.unit-card:visible').count(),2);assert.equal(await page.locator('#dp').textContent(),'40');assert.equal(await page.evaluate(()=>BlueprintDefense.game.warehouseLine.length),20);
 await cell(2,11);assert.match(await page.locator('#selectionTag').textContent(),/自带设施/);assert(!(await page.locator('#withdrawBtn').isVisible()));assert(!(await page.locator('#rotateBtn').isVisible()));assert.match(await page.locator('#placementHint').textContent(),/不可拆除/);
 assert.equal(await page.locator('#warehouseItems b').evaluateAll(xs=>xs.filter(x=>x.textContent==='∞').length),3);assert.equal(await page.locator('#warehouseItems b').evaluateAll(xs=>xs.filter(x=>x.textContent==='0').length),5);
 checks.push('the full bottom row is free and immutable; only two ports are buildable, and inventory distinguishes three infinite raw materials from five finite products');
 await page.evaluate(()=>{const g=BlueprintDefense.game;for(const [type,x,y,dir] of [[0,1,10,3],[1,1,9,0],[2,2,9,0],[1,3,9,1],[8,3,10,1],[0,5,10,3],[1,5,9,0],[5,6,9,0],[3,7,9,0]]){const r=g.deployProduction(type,x,y,dir);if(!r.unit)throw Error(r.error);}BlueprintDefense.updateUI();});
 await cell(1,10);await page.locator('#productionOption').selectOption('item_iron_ore');assert.match(await page.locator('#productionOption option:checked').textContent(),/蓝铁矿.*∞/);
 await cell(2,9);await page.locator('#productionOption').selectOption('furnance_iron_nugget_1');await cell(5,10);await page.locator('#productionOption').selectOption('item_iron_nugget');assert.match(await page.locator('#productionState').textContent(),/库存不足/);
 await page.locator('#startBtn').click();await page.keyboard.press('Space');await page.evaluate(()=>{const g=BlueprintDefense.game;g.togglePause();g.advance(26);g.togglePause();BlueprintDefense.updateUI();});
 assert((await page.evaluate(()=>BlueprintDefense.game.productionEarned))>=28);assert((await page.evaluate(()=>BlueprintDefense.game.productionAt(3,10).delivered))>=6);
 // Stop the finished-goods outlet so the real refinery can build visible stock.
 await cell(5,10);await page.locator('#withdrawBtn').click();await page.evaluate(()=>{const g=BlueprintDefense.game;g.togglePause();g.advance(6);g.togglePause();BlueprintDefense.updateUI();});
 const stock=await page.evaluate(()=>BlueprintDefense.game.warehouseCount('item_iron_nugget'));assert(stock>=1);assert.equal(await page.locator('#warehouseItems>div').filter({has:page.locator('img[alt="蓝铁块"]')}).locator('b').textContent(),String(stock));
 await page.locator('[data-production-type="0"]').click();await cell(5,10);await page.keyboard.press('Escape');await cell(5,10);await page.locator('#productionOption').selectOption('item_iron_nugget');assert.match(await page.locator('#productionOption option:checked').textContent(),new RegExp(stock+' 库存'));
 await page.screenshot({path:path.join(root,'reports/warehouse_desktop.png')});
 checks.push('original blue-iron refining feeds a deposit port, a separate outlet supplies component processing, DP is earned, and real stored counts update in the inventory and selector');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(root,'reports/warehouse_phone.png'),fullPage:true});
 await page.locator('#resetBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.length),0);assert.equal(await page.evaluate(()=>BlueprintDefense.game.warehouseLine.length),20);assert.equal(await page.evaluate(()=>BlueprintDefense.game.warehouseCount('item_iron_nugget')),0);assert.equal(await page.locator('#dp').textContent(),'40');
 checks.push('warehouse controls fit the phone width and replay clears player stock while preserving the free row and infinite materials');
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'reports/warehouse_browser_checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
