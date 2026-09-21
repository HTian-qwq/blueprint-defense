const {chromium}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[],checks=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);
    await page.evaluate(()=>BlueprintDefense.ready);
    await page.locator('.unit-card img,.blueprint-cover img').evaluateAll(xs=>Promise.all(xs.map(x=>x.decode())));
    const view=()=>page.evaluate(()=>{const c=BlueprintDefense.camera;return [c.zoom,c.cx,c.cy];});
    async function cell(x,y){const p=await page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};},{x,y});await page.mouse.click(p.x,p.y);}
    assert.equal(await page.locator('.unit-card:visible').count(),16);
    const canvas=await page.locator('#board').boundingBox(),sidebar=await page.locator('aside').boundingBox();
    assert(canvas.width>1540*.7);assert(sidebar.x>=canvas.x+canvas.width);
    const portraits=await page.evaluate(()=>[...document.querySelectorAll('.unit-card:not([hidden])')].every(b=>{const d=b.dataset.productionType===undefined?DATA.towers[Number(b.dataset.type)]:DATA.production.types[Number(b.dataset.productionType)];return b.querySelector('img').src===DATA.deviceArt[d.id].image&&b.querySelector('img').src!==d.image;}));
    assert(portraits,'inventory cards use original colored item portraits, not the flat map symbols');
    const cards=await page.locator('.unit-card:visible').evaluateAll(xs=>xs.map(x=>({x:x.offsetLeft,y:x.offsetTop})));
    assert.equal(cards.filter(p=>p.y===cards[0].y).length,4);
    await page.screenshot({path:path.join(root,'reports/preview_v6_ready.png')});
    checks.push('desktop preview has a wide drafting canvas, four-column original colored portraits and a decoded original blueprint cover');

    const before=await view();await page.locator('[data-type="0"]').click();await cell(5,3);
    assert.equal(await page.locator('[data-type="0"] .owned-count').textContent(),'×1');
    assert.equal(await page.locator('#blueprintDeviceCount').textContent(),'1 台设备');
    assert.equal(await page.locator('.unit-card:visible').count(),16);
    await cell(5,3);await page.locator('#upgradeBtn').click();
    assert.equal(await page.locator('#detailName').textContent(),'扩装铳械塔');
    assert.equal(await page.locator('[data-type="0"] .owned-count').textContent(),'×1');
    assert.deepEqual(await view(),before,'configuring a tower must not resize or pan the map');
    const scroll=await page.locator('#sidebarScroll').boundingBox();await page.mouse.move(scroll.x+scroll.width/2,scroll.y+scroll.height/2);await page.mouse.wheel(0,850);
    await page.waitForFunction(()=>document.getElementById('sidebarScroll').scrollTop>100);
    assert.deepEqual(await view(),before);assert.equal(await page.evaluate(()=>scrollY),0);
    await cell(5,3);assert.equal(await page.locator('#sidebarScroll').evaluate(x=>x.scrollTop),0);
    assert((await page.locator('.inspection').boundingBox()).y<scroll.y+20);
    await page.screenshot({path:path.join(root,'reports/preview_v6_inspection.png')});
    await page.locator('#withdrawBtn').click();assert.equal(await page.locator('[data-type="0"] .owned-count').textContent(),'×0');
    checks.push('real deployment, upgrade and withdrawal keep card counts correct; selecting a unit reveals its inspector while sidebar scrolling leaves the map fixed');

    await page.locator('[data-deck-page="2"]').click();await page.locator('[data-production-type="2"]').click();
    await page.locator('#panBtn').click();const dp=await page.evaluate(()=>BlueprintDefense.game.dp);
    await page.locator('#selectBtn').click();assert.equal(await page.locator('#panBtn').getAttribute('aria-pressed'),'false');
    assert.equal(await page.evaluate(()=>BlueprintDefense.choice),-1);await cell(3,3);
    assert.equal(await page.evaluate(()=>BlueprintDefense.game.dp),dp);assert.equal(await page.evaluate(()=>BlueprintDefense.game.production.length),0);
    await page.locator('[data-deck-page="-1"]').click();assert.equal(await page.locator('.unit-card:visible').count(),16);
    checks.push('the select tool exits both placement and pan mode without spending DP, and All restores the complete inventory');

    await page.locator('#resetBtn').click();
    for(const [width,height] of [[1920,1080],[1366,768],[1000,800],[900,900],[780,1000],[560,844],[390,844]]){
      await page.setViewportSize({width,height});await page.waitForFunction(w=>innerWidth===w,width);
      await page.waitForTimeout(80);
      const layout=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,height:r.height};},row=document.querySelector('.telemetry');return {w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,row:box(row),children:[...row.children].map(box),canvas:box(document.getElementById('board'))};});
      assert(layout.w<=width&&layout.h<=height,`viewport overflow at ${width}`);
      assert(layout.canvas.height>150,`usable canvas at ${width}`);
      const toolbar=await page.locator('.view-controls').boundingBox();assert(layout.canvas.bottom<=toolbar.y+1,`view tools cover the warehouse row at ${width}`);
      for(const r of layout.children)assert(r.left>=layout.row.left&&r.right<=layout.row.right+1&&r.top>=layout.row.top&&r.bottom<=layout.row.bottom+1,`clipped battle control at ${width}: ${JSON.stringify(layout)}`);
    }
    const first=await page.locator('.unit-card:visible').first().boundingBox(),audio=await page.locator('.sidebar-audio').boundingBox();
    assert(first.y+first.height<audio.y,'the first equipment row must be visible without scrolling on a phone');
    await page.screenshot({path:path.join(root,'reports/preview_v6_phone.png')});
    checks.push('seven viewport sizes retain all battle controls and a usable canvas; phone layouts expose equipment immediately without document overflow');

    await page.locator('[data-type="0"]').click();await cell(5,3);await cell(5,3);
    assert.equal(await page.locator('#detailName').textContent(),'铳械塔');
    const sc=await page.locator('#sidebarScroll').boundingBox(),heading=await page.locator('.tower-heading').boundingBox();
    assert(heading.y>=sc.y&&heading.y+heading.height<=sc.y+sc.height);
    await page.locator('#upgradeBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers[0].level),2);
    await page.screenshot({path:path.join(root,'reports/preview_v6_phone_inspection.png')});
    await page.locator('#startBtn').click();await page.locator('#startBtn').click();
    assert.equal(await page.evaluate(()=>BlueprintDefense.game.phase),'paused');
    await page.screenshot({path:path.join(root,'reports/preview_v6_phone_paused.png')});
    checks.push('phone users can deploy, inspect, upgrade and pause from the restructured panes');
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(root,'reports/preview_ui_browser_checks.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));
    console.log(JSON.stringify({passed:checks.length,checks,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
