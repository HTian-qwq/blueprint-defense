const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BLUEPRINT_TEST_URL||pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await page.waitForFunction(()=>window.BlueprintDefense?.session);await page.evaluate(()=>BlueprintDefense.ready);await page.evaluate(()=>BlueprintDefense.session.ready);
 if(await page.locator('#mainMenu').evaluate(e=>e.open)){await page.locator('#menuNew').click();if(await page.locator('#sessionConfirm').evaluate(e=>e.open))await page.locator('#sessionConfirmOK').click();}
 async function point(x,y){return page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};},{x,y});}
 async function cell(x,y){const p=await point(x,y);await page.mouse.click(p.x,p.y);}
 async function type(n){await page.locator('[data-deck-page="2"]').click();await page.locator(`[data-production-type="${n}"]`).click();}
 async function drag(cells){const first=await point(...cells[0]);await page.mouse.move(first.x,first.y);await page.mouse.down();for(const c of cells.slice(1)){const p=await point(...c);await page.mouse.move(p.x,p.y,{steps:8});}await page.mouse.up();}
 await cell(41,9);assert(await page.locator('#coreConfig').isVisible());assert.equal(await page.locator('#coreOutputList select').count(),6);
 const output=page.locator('#core-outputs-1');assert.equal(await output.inputValue(),'');assert(await output.locator('option[value="item_iron_ore"]').isDisabled());
 await output.selectOption('item_originium_ore');assert.equal(await page.evaluate(()=>BlueprintDefense.game.corePorts.find(p=>p.id==='core-outputs-1').source),'item_originium_ore');
 checks.push('clicking an original core outlet exposes six independent selectors, with research-locked materials disabled');
 await type(1);await cell(42,9);
 await type(2);await cell(43,8);
 assert.deepEqual(await page.evaluate(()=>{const p=BlueprintDefense.game.production.find(p=>p.type===2);return[p.x,p.y,p.dir];}),[43,8,0]);
 await type(1);await drag([[46,9],[46,4],[34,4]]);
 assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(34,4).dir),1);
 checks.push('a directly adjacent refinery aligns without changing its anchor; a dragged return belt automatically faces the core inlet');
 await page.locator('#startBtn').click();await page.locator('#speedBtn').click();
 await page.waitForFunction(()=>BlueprintDefense.game.warehouseCount('item_crystal_shell')>=1,null,{timeout:35000});await page.locator('#startBtn').click();
 assert.equal(await page.evaluate(()=>BlueprintDefense.game.phase),'paused');await cell(37,9);
 assert.match(await page.locator('#coreInputState').textContent(),/已接收 [1-9]/);
 const state=await page.evaluate(()=>BlueprintDefense.game.corePorts.map(({id,source,cargo,work,delivered})=>({id,source,cargo,work,delivered})));
 await page.screenshot({path:path.join(root,'reports/core_logistics.png')});
 await page.evaluate(()=>BlueprintDefense.session.save());await page.reload();await page.waitForFunction(()=>window.BlueprintDefense?.session);await page.evaluate(()=>BlueprintDefense.ready);await page.evaluate(()=>BlueprintDefense.session.ready);
 await page.locator('#menuContinue').click();assert.deepEqual(await page.evaluate(()=>BlueprintDefense.game.corePorts.map(({id,source,cargo,work,delivered})=>({id,source,cargo,work,delivered}))),state);
 checks.push('real running production withdraws ore from the core, refines it, returns finished stock to the core, then resumes exactly from a saved paused run');
 // Separate clean page avoids destroying the saved logistics run during packing checks.
 const packing=await browser.newPage({viewport:{width:1540,height:1060}});packing.on('pageerror',e=>errors.push(e.message));await packing.goto(page.url());await packing.waitForFunction(()=>window.BlueprintDefense?.session);await packing.evaluate(()=>BlueprintDefense.ready);await packing.evaluate(()=>BlueprintDefense.session.ready);if(await packing.locator('#mainMenu').evaluate(e=>e.open))await packing.locator('#menuNew').click();
 // Helpers intentionally use only real pointer/key input for placement.
 await packing.locator('[data-deck-page="2"]').click();await packing.locator('[data-production-type="2"]').click();
 for(const [x,y] of [[10,24],[13,24],[16,24],[13,21]]){
  const p=await packing.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};},{x,y});await packing.mouse.move(p.x,p.y);await packing.mouse.click(p.x,p.y);
 }
 assert.deepEqual(await packing.evaluate(()=>BlueprintDefense.game.production.map(p=>[p.x,p.y])),[[10,24],[13,24],[16,24],[13,21]]);
 assert.equal(await packing.locator('#snapBtn').getAttribute('aria-pressed'),'true');await packing.screenshot({path:path.join(root,'reports/placement_adjacent.png')});
 checks.push('auto-alignment on: successive 3x3 machines touch edge to edge, and a formerly displaced corner anchor remains exact');
 assert.deepEqual(errors,[]);const report={passed:checks.length,checks,errors};await fs.writeFile(path.join(root,'reports/core_logistics_browser_checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
