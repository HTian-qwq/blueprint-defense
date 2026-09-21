const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1540,height:1060}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.BLUEPRINT_TEST_URL||pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
 await page.locator('#scenario').selectOption('boss');await page.keyboard.press('9');const point=await page.evaluate(()=>{const p=BlueprintDefense.screen(22.5,17.5),r=document.getElementById('board').getBoundingClientRect();return {x:p.x+r.x,y:p.y+r.y};});await page.mouse.click(point.x,point.y);await page.mouse.click(point.x,point.y);await page.locator('#upgradeBtn').click();assert.equal(await page.locator('#detailName').textContent(),'维什戴尔改件');
 const comparisons=await page.evaluate(()=>{
  const {game:g,actors}=BlueprintDefense,t=g.towers[0],results=[];
  for(const [shots,disabled] of [[0,false],[1,false],[2,false],[3,false],[4,false],[0,true]]){
   const sample={...t,shots,animationStart:0,lastShotAt:3,disabledSince:3,disabledUntil:disabled?10:0};
   const make=()=>{const c=document.createElement('canvas');c.width=400;c.height=360;return c;},right=make(),left=make(),mirror=make();
   actors.draw(right.getContext('2d'),{...sample,facing:1},3.3,{x:50,y:0},100,{width:3,depth:3});actors.draw(left.getContext('2d'),{...sample,facing:-1},3.3,{x:50,y:0},100,{width:3,depth:3});
   const m=mirror.getContext('2d');m.translate(400,0);m.scale(-1,1);m.drawImage(right,0,0);
   const a=left.getContext('2d').getImageData(0,0,400,360).data,b=m.getImageData(0,0,400,360).data,c=right.getContext('2d').getImageData(0,0,400,360).data;
   let error=0,changed=0,visible=0;for(let i=0;i<a.length;i++){error+=Math.abs(a[i]-b[i]);changed+=Math.abs(a[i]-c[i]);if(i%4===3&&a[i]>100)visible++;}
   results.push({name:BlueprintActorPose(DATA.wisadel,sample,3.3).name,error:error/a.length,changed,visible});
  }return results;
 });assert.equal(comparisons.length,6);for(const result of comparisons){assert(result.error<1,JSON.stringify(result));assert(result.changed>10000);assert(result.visible>1000);}
 checks.push('idle, three attack clips, special and stun mirror around one stable foot anchor; pixels match a horizontal mirror');
 await page.evaluate(()=>{const {game:g}=BlueprintDefense;g.start();g.togglePause();g.time=4;const t=g.towers[0];t.animationStart=0;t.shots=0;g.aimTower(t,{id:990,x:20.5,y:16.5});BlueprintDefense.updateUI();BlueprintDefense.render();});for(let i=0;i<4;i++)await page.locator('#zoomIn').click();await page.screenshot({path:path.join(root,'reports/wisadel_facing_left.png')});
 const before=await page.evaluate(()=>JSON.stringify({t:BlueprintDefense.game.towers[0],time:BlueprintDefense.game.time}));await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>JSON.stringify({t:BlueprintDefense.game.towers[0],time:BlueprintDefense.game.time})),before);
 await page.evaluate(()=>{const g=BlueprintDefense.game;g.aimTower(g.towers[0],{id:991,x:26.5,y:16.5});BlueprintDefense.render();});await page.screenshot({path:path.join(root,'reports/wisadel_facing_right.png')});assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers[0].facing),1);assert.equal(await page.locator('#detailName').textContent(),'维什戴尔改件');assert.equal(await page.locator('#detailDamage').textContent(),'33000');
 checks.push('the board shows opposite target-facing poses and aim markers; pause leaves pose unchanged and inspector labels stay upright');
 await page.setViewportSize({width:390,height:844});await page.locator('#zoomReset').click();await page.screenshot({path:path.join(root,'reports/wisadel_facing_phone.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#resetBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.game.towers.length),0);assert.deepEqual(errors,[]);
 checks.push('phone layout and reset work with directional actors without browser errors');
 const result={passed:checks.length,checks,comparisons,errors};await fs.writeFile(path.join(root,'reports/actor_facing_browser_checks.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
