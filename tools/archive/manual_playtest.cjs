// Interactive UI-only playtest driver. No simulation reads or writes.
const {chromium}=require('playwright');
const readline=require('node:readline');
const path=require('node:path');
const fs=require('node:fs/promises');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1540,height:1060}});
 const transcript=[];let shot=0;
 page.on('pageerror',e=>transcript.push({error:e.message}));
 await page.goto('http://127.0.0.1:8768/blueprint_defense.html');
 await page.locator('.unit-card img').evaluateAll(xs=>Promise.all(xs.map(x=>x.decode())));
 async function observe(label){
  const state={label,realTime:new Date().toISOString()};
  for(const id of ['dp','life','kills','wave','waveName','startBtn','deploymentCount','productionIncome','status','detailName','detailDesc','productionState','bossPhase','bossNumbers','resultTitle','resultText']){
   const el=page.locator('#'+id);if(await el.isVisible())state[id]=await el.innerText();
  }
  const file=path.join(root,'reports',`manual_play_${String(shot++).padStart(2,'0')}.png`);
  await page.screenshot({path:file});state.screenshot=file;transcript.push(state);
  await fs.writeFile(path.join(root,'reports/manual_play_transcript.json'),JSON.stringify(transcript,null,2));
  console.log(JSON.stringify(state));
 }
 await observe('ready');
 const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
 for await(const line of input){
  try{
   const request=JSON.parse(line);if(request.close){await observe('finished');input.close();process.stdin.destroy();break;}
   for(const a of request.actions||[]){
    transcript.push({action:a,realTime:new Date().toISOString()});
    if(a.click)await page.locator(a.click).click();
    else if(a.key)await page.keyboard.press(a.key);
    else if(a.cell){
     const r=await page.locator('#board').boundingBox(),s=Math.min(r.width/20,r.height/12)*.95;
     await page.mouse.click(r.x+(r.width-20*s)/2+(a.cell[0]+.5)*s,r.y+(r.height-12*s)/2+(a.cell[1]+.5)*s);
    }else if(a.wait)await page.waitForTimeout(Math.min(45000,a.wait));
    else if(a.select)await page.locator(a.select).selectOption(a.value);
    else if(a.wheel){await page.locator(a.over||'#sidebarScroll').hover();await page.mouse.wheel(0,a.wheel);}
   }
   await observe(request.label||'observe');
  }catch(e){console.log(JSON.stringify({error:e.message}));}
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
