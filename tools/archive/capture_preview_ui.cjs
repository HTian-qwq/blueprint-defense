// Capture actual UI states at representative desktop and touch viewport sizes.
const {chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8768/blueprint_defense.html');await page.evaluate(()=>BlueprintDefense.ready);await page.locator('.unit-card img,.blueprint-cover img').evaluateAll(xs=>Promise.all(xs.map(x=>x.decode())));
 const layouts=[];
 for(const [width,height] of [[1920,1080],[1540,1060],[1366,768],[1000,800],[900,900],[780,1000],[560,844],[390,844]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);
  layouts.push(await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,canvas:box('#board'),toolbar:box('.view-controls'),telemetry:box('.telemetry'),controls:[...document.querySelector('.telemetry').children].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom};}),firstCard:box('.unit-card:not([hidden])'),audio:box('.sidebar-audio'),cards:[...document.querySelectorAll('.unit-card:not([hidden])')].length};}));
  if([1920,1540,390].includes(width))await page.screenshot({path:path.join(root,`reports/preview_refined_${width}.png`)});
 }
 await page.setViewportSize({width:1920,height:1080});
 const {starterPlan,campaignPlan}=require('../tests/geometry_helpers.cjs');
 const battle=await page.evaluate(({starterPlan,campaignPlan})=>{const g=BlueprintDefense.game;for(const [type,x,y,dir] of starterPlan)g.deployProduction(type,x,y,dir);let n=0;g.start();for(let i=0;i<30000&&g.phase==='running';i++){while(n<campaignPlan.length&&g.dp>=DATA.towers[campaignPlan[n][0]].cost)g.deploy(...campaignPlan[n++]);if(n===campaignPlan.length)for(const t of g.towers)if(!DATA.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);g.step(.05);if(g.wave===4&&g.enemies.length>24)break;}g.togglePause();BlueprintDefense.updateUI();BlueprintDefense.render();return {wave:g.wave+1,life:g.life,enemies:g.enemies.length,towers:g.towers.length,production:g.production.length};},{starterPlan,campaignPlan});
 await page.screenshot({path:path.join(root,'reports/preview_refined_battle.png')});
 const result={layouts,battle,errors};await fs.writeFile(path.join(root,'reports/preview_refined_layout.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
