const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url'),root=path.resolve(__dirname,'..'),url=pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href;
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.evaluate(()=>BlueprintDefense.ready);
  const state=()=>page.evaluate(()=>{const c=BlueprintDefense.camera;return {zoom:c.zoom,cx:c.cx,cy:c.cy,...c.view};});
  async function cell(x,y){return page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};},{x,y});}
  async function clickCell(x,y){const p=await cell(x,y);await page.mouse.click(p.x,p.y);}
  await page.locator('#zoomIn').click();assert.equal((await state()).zoom,1.25);await page.locator('#zoomReset').click();assert.equal((await state()).zoom,1);
  await page.keyboard.press('+');assert.equal((await state()).zoom,1.25);await page.keyboard.press('-');assert.equal((await state()).zoom,1);
  for(let i=0;i<9;i++)await page.keyboard.press('+');assert.equal((await state()).zoom,4);assert(await page.locator('#zoomIn').isDisabled());assert.equal(await page.locator('#zoomLevel').textContent(),'400%');
  for(let i=0;i<11;i++)await page.keyboard.press('-');assert.equal((await state()).zoom,.5);assert(await page.locator('#zoomOut').isDisabled());await page.keyboard.press('0');
  assert.equal((await state()).zoom,1);assert.equal(await page.evaluate(()=>BlueprintDefense.game.dp),40);
  checks.push('buttons and + / - / 0 shortcuts zoom within 50–400%, disable at limits and reset without changing the game');
  for(let i=0;i<4;i++)await page.locator('#zoomIn').click();
  const r=await page.locator('#board').boundingBox(),anchor={x:Math.floor(r.x+r.width*.55)-r.x,y:Math.floor(r.y+r.height*.55)-r.y},before=await page.evaluate(p=>BlueprintDefense.camera.world(p.x,p.y),anchor),oldZoom=(await state()).zoom;
  await page.mouse.move(r.x+anchor.x,r.y+anchor.y);await page.mouse.wheel(0,-160);await page.waitForFunction(z=>BlueprintDefense.camera.zoom>z,oldZoom);
  const after=await page.evaluate(p=>BlueprintDefense.camera.world(p.x,p.y),anchor);assert(Math.abs(after.x-before.x)<1e-6);assert(Math.abs(after.y-before.y)<1e-6);assert.equal(await page.evaluate(()=>scrollY),0);
  checks.push('wheel zoom preserves the world point under the pointer and does not scroll the page');
  await page.locator('[data-deck-page="3"]').click();await page.locator('[data-production-type="0"]').click();
  const origin=await cell(8,5);await page.mouse.move(origin.x,origin.y);await page.mouse.down();await page.mouse.move(origin.x+75,origin.y+35,{steps:8});await page.mouse.up();
  assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.length),0);assert.equal(await page.evaluate(()=>BlueprintDefense.game.dp),40);
  await clickCell(8,5);assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(8,5)?.type),0);assert.equal(await page.evaluate(()=>BlueprintDefense.game.dp),38);
  await page.keyboard.press('Escape');await clickCell(8,5);await page.keyboard.press('r');assert.equal(await page.evaluate(()=>BlueprintDefense.game.productionAt(8,5).dir),0);assert.equal(await page.locator('#detailName').textContent(),'仓库取货口');
  await page.keyboard.press('1');await clickCell(7,6);assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers[0].x),7);assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers[0].y),6);
  await page.keyboard.press('Escape');await clickCell(7,6);assert.equal(await page.locator('#detailName').textContent(),'铳械塔');
  checks.push('dragging with a build card selected never spends DP; zoomed/panned deployment, inspection and rotation use the correct grid');
  const drag=await cell(7,6),beforePan=await state();await page.mouse.move(drag.x,drag.y);await page.mouse.down({button:'middle'});await page.mouse.move(drag.x-55,drag.y+20,{steps:5});await page.mouse.up({button:'middle'});
  assert((await state()).cx>beforePan.cx);assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.length),1);
  await page.keyboard.press('1');await page.locator('#panBtn').click();assert.equal(await page.locator('#panBtn').getAttribute('aria-pressed'),'true');await clickCell(8,6);assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.length),1);
  await page.locator('#panBtn').click();await page.keyboard.press('Escape');
  const focus=await state();await page.setViewportSize({width:1450,height:1000});await page.waitForFunction(w=>BlueprintDefense.camera.w!==w,focus.w);const resized=await state();assert.equal(resized.zoom,focus.zoom);assert(Math.abs(resized.cx-focus.cx)<1e-6);assert(Math.abs(resized.cy-focus.cy)<1e-6);
  await page.locator('[data-deck-page="3"]').click();await page.screenshot({path:path.join(root,'reports/zoom_desktop.png')});
  await page.locator('#resetBtn').click();assert.equal((await state()).zoom,1);assert(Math.abs((await state()).cx-10)<1e-6);assert(Math.abs((await state()).cy-6)<1e-6);assert.equal(await page.locator('#panBtn').getAttribute('aria-pressed'),'false');
  checks.push('middle drag and explicit pan mode avoid building, viewport resize retains focus, and replay restores the complete map');
  // Native browser touch events: a pinch must not commit the first finger as a placement.
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),phone=await context.newPage();phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(url);await phone.evaluate(()=>BlueprintDefense.ready);await phone.locator('[data-deck-page="3"]').tap();await phone.locator('[data-production-type="0"]').tap();await phone.locator('#board').scrollIntoViewIfNeeded();
  const box=await phone.locator('#board').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2,cdp=await context.newCDPSession(phone);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});
  await touch('touchStart',[[1,x-30,y]]);await touch('touchStart',[[1,x-30,y],[2,x+30,y]]);await touch('touchMove',[[1,x-65,y],[2,x+65,y]]);
  await phone.waitForFunction(()=>BlueprintDefense.camera.zoom>2);await touch('touchEnd',[[1,x-65,y]]);await touch('touchMove',[[1,x-35,y+15]]);await touch('touchEnd',[]);
  assert.equal(await phone.evaluate(()=>BlueprintDefense.game.production.length),0);assert.equal(await phone.evaluate(()=>BlueprintDefense.game.dp),40);
  const target=await phone.evaluate(()=>{const p=BlueprintDefense.screen(8.5,5.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};});await phone.touchscreen.tap(target.x,target.y);
  assert.equal(await phone.evaluate(()=>BlueprintDefense.game.productionAt(8,5)?.type),0);assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await phone.screenshot({path:path.join(root,'reports/zoom_phone.png'),fullPage:true});await phone.locator('#zoomReset').tap();assert.equal(await phone.evaluate(()=>BlueprintDefense.camera.zoom),1);
  checks.push('native two-finger pinch and one-finger continuation pan without accidental placement; a later tap builds accurately on mobile');
  await context.close();assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'reports/zoom_browser_checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
