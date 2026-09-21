// Interactive campaign play: all actions use browser UI; time advances only via
// the normal animation loop and the player's 1x/2x buttons. Engine reads below
// are observation/logging only, never resource grants or simulation stepping.
const {chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),readline=require('node:readline'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'reports',process.env.BLUEPRINT_PLAY_DIR||'campaign_play');
(async()=>{
 await fs.mkdir(dir,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[];let shot=0;
 page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8768/blueprint_defense.html',{timeout:30000});await page.evaluate(()=>BlueprintDefense.ready);
 const build=await fs.readFile(path.join(root,'dist/blueprint_defense.html'));
 await fs.writeFile(path.join(dir,'method.json'),JSON.stringify({started:new Date().toISOString(),buildSha256:crypto.createHash('sha256').update(build).digest('hex'),method:'Fresh normal campaign, actual browser UI input and wall-clock game loop, ordinary pause/build/research/2x controls. No simulated stepping, state writes or resource grants.'},null,2));
 async function point(x,y){return page.evaluate(({x,y})=>{const p=BlueprintDefense.screen(x+.5,y+.5),r=document.getElementById('board').getBoundingClientRect();return{x:p.x+r.x,y:p.y+r.y};},{x,y});}
 async function snapshot(){
  const state=await page.evaluate(()=>{
   const g=BlueprintDefense.game,text=id=>document.getElementById(id).innerText;
   return {phase:g.phase,time:+g.time.toFixed(1),wave:g.wave+1,waveName:text('waveName'),tickets:text('dp'),life:g.life,kills:g.kills,leaked:g.leaked,total:g.total,spawned:g.spawned,enemies:g.enemies.length,preparation:+g.intermission.toFixed(1),research:text('researchSummary'),stock:{...g.warehouse},income:text('productionIncome'),status:text('status'),selection:text('detailName'),upgrade:text('upgradeBtn'),upgradeDisabled:document.getElementById('upgradeBtn').disabled,supply:text('supplyDetail'),boss:g.boss?{name:text('bossName'),phase:text('bossPhase'),health:text('bossNumbers'),outcome:g.bossOutcome}:null,towers:g.towers.map(t=>({type:t.type,x:t.x,y:t.y,level:t.level,kills:t.kills,awaiting:t.awaitingSupply,ammo:t.ammoRemaining})),production:g.production.map(p=>({type:p.type,x:p.x,y:p.y,dir:p.dir,recipe:p.recipe,source:p.source,deliveryMode:p.deliveryMode,status:g.productionStatus(p)})),result:document.getElementById('result').hidden?null:text('resultText')};
  });
  const file=path.join(dir,String(++shot).padStart(3,'0')+'.png');await page.screenshot({path:file});const entry={at:new Date().toISOString(),file,state,errors:[...errors]};await fs.appendFile(path.join(dir,'log.jsonl'),JSON.stringify(entry)+'\n');console.log(JSON.stringify(entry));
 }
 async function run(options){
  const text=await page.locator('#startBtn').innerText();if(/开始|继续/.test(text))await page.locator('#startBtn').click();
  let preparationWasLeft=!(await page.locator('#prepPanel').isVisible());const start=Date.now(),limit=Math.min(45000,(options.seconds??45)*1000);
  while(Date.now()-start<limit){
   await page.waitForTimeout(150);
   const observed=await page.evaluate(()=>({tickets:Number(document.getElementById('dp').innerText.replaceAll(',','')),kills:BlueprintDefense.game.kills,preparing:!document.getElementById('prepPanel').hidden,ended:!document.getElementById('result').hidden,stock:Object.fromEntries([...document.querySelectorAll('[data-stock]')].map(e=>[e.dataset.stock,Number(e.innerText.split('×').at(-1))])),research:document.getElementById('researchSummary').innerText}));
   if(!observed.preparing)preparationWasLeft=true;
   if(observed.ended||options.tickets!=null&&observed.tickets>=options.tickets||options.kills!=null&&observed.kills>=options.kills||options.preparation&&observed.preparing&&preparationWasLeft||options.stock&&Object.entries(options.stock).every(([id,n])=>(observed.stock[id]||0)>=n)||options.researched!=null&&observed.research.includes(`已研究 ${options.researched} /`))break;
  }
  if((await page.locator('#startBtn').innerText()).startsWith('暂停'))await page.locator('#startBtn').click();
 }
 await snapshot();
 for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
  try{
   const command=JSON.parse(line);await fs.appendFile(path.join(dir,'actions.jsonl'),JSON.stringify({at:new Date().toISOString(),command})+'\n');
   for(const a of command.actions||[command]){
    if(a.click)await page.locator(a.click).click();
    else if(a.key)await page.keyboard.press(a.key);
    else if(a.cell){const p=await point(...a.cell);await page.mouse.click(p.x,p.y);}
    else if(a.select)await page.locator(a.select[0]).selectOption(a.select[1]);
    else if(a.run)await run(a.run);
    else if(a.wait)await page.waitForTimeout(Math.min(45000,a.wait));
    else if(a.close){await browser.close();return;}
   }
   await snapshot();
  }catch(e){console.log(JSON.stringify({error:e.message}));if((await page.locator('#startBtn').innerText()).startsWith('暂停'))await page.locator('#startBtn').click();await snapshot();}
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
