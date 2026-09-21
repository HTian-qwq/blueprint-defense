const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),manifest=require('../assets/fonts/subsets/manifest.json');
const url=process.env.BLUEPRINT_WEB_URL||'http://127.0.0.1:8770/blueprint_defense.html';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];try{
 const context=await browser.newContext({viewport:{width:1540,height:1060}}),page=await context.newPage(),requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(url);await page.waitForFunction(()=>window.BlueprintDefense?.session);await page.evaluate(()=>BlueprintDefense.session.ready);await page.locator('#loadingScreen').waitFor({state:'hidden'});await page.evaluate(()=>document.fonts.ready);
 const loaded=()=>requests.filter(u=>u.endsWith('.woff2'));
 const expected=manifest.subsets.slice(0,2).map(s=>s.sha256.slice(0,16)+'.woff2').sort();
 assert.deepEqual(loaded().map(u=>u.split('/').at(-1)).sort(),expected);assert(!requests.some(u=>u.endsWith('.ttf')));
 assert(manifest.startupBytes<400*1024);assert(manifest.startupBytes/manifest.sourceBytes<.02);
 assert(requests.every(u=>new URL(u).origin===new URL(url).origin));
 const hotBytes=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.woff2')).reduce((n,r)=>n+r.decodedBodySize,0));assert.equal(hotBytes,manifest.startupBytes);
 await page.screenshot({path:path.join(root,'reports/font_menu.png')});
 checks.push('a cold menu fetches only the Latin and game shards (under 400 KiB), with no complete TTF or third-party requests');
 const rare=manifest.subsets.slice(2).find(p=>p.codepoints.includes('龘'.codePointAt(0))),rareText='龘';assert(rare);
 await page.evaluate(text=>{const e=document.createElement('div');e.id='fontRare';e.textContent=text;e.style.cssText='position:fixed;z-index:99999;background:white;font:32px "HarmonyOS Sans SC"';document.body.append(e);},rareText);
 await page.evaluate(text=>document.fonts.load('400 32px "HarmonyOS Sans SC"',text),rareText);
 assert.equal(loaded().length,3);assert(loaded().at(-1).endsWith(rare.sha256.slice(0,16)+'.woff2'));
 checks.push('displaying an uncommon Chinese character fetches exactly its one extra shard');
 // Compare against the retained source in a test-only route, never a release resource.
 await page.route('**/font-reference.ttf',route=>route.fulfill({path:path.join(root,'assets/fonts/HarmonyOS_Sans_SC.ttf'),contentType:'font/ttf'}));
 await page.evaluate(async()=>{const f=new FontFace('HarmonyReference','url("./font-reference.ttf")',{weight:'40 900'});document.fonts.add(await f.load());});
 const same=await page.evaluate(text=>{
   const draw=(family,weight)=>{const c=document.createElement('canvas');c.width=900;c.height=80;const x=c.getContext('2d');x.font=`${weight} 28px "${family}"`;x.fillText(text,5,45);return {width:x.measureText(text).width,pixels:c.toDataURL()};};
   return [400,700].map(weight=>{const a=draw('HarmonyOS Sans SC',weight),b=draw('HarmonyReference',weight);return {weight,width:a.width===b.width,pixels:a.pixels===b.pixels};});
 },'蓝图防线 协议核心 折金票 0123456789 → 龘');
 assert(same.every(r=>r.width&&r.pixels),JSON.stringify(same));await page.locator('#fontRare').evaluate(e=>e.remove());
 await page.locator('#menuNew').click();await page.locator('#techBtn').click();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(root,'reports/font_research.png')});
 checks.push('regular and bold canvas glyphs match the original variable font pixel-for-pixel, including Chinese, digits and a rare character');
 const offline=await browser.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await offline.evaluate(()=>BlueprintDefense.ready);
 assert(await offline.evaluate(()=>document.fonts.check('700 20px "HarmonyOS Sans SC"','协议核心')));assert.equal(await offline.evaluate(()=>[...document.fonts].filter(f=>f.status==='loaded').length),2);await offline.close();
 checks.push('the offline build embeds WOFF2 shards and loads the complete game charset without a server');
 const broken=await browser.newPage();broken.on('pageerror',e=>errors.push(e.message));await broken.route('**/*.woff2',r=>r.abort());await broken.goto(url);await broken.waitForFunction(()=>window.BlueprintDefense?.session);await broken.locator('#loadingScreen').waitFor({state:'hidden'});await broken.locator('#menuNew').click();await broken.locator('#startBtn').click();assert.equal(await broken.evaluate(()=>BlueprintDefense.game.phase),'running');await broken.close();
 checks.push('failed font downloads fall back to system text without blocking the menu or battle');
 assert.deepEqual(errors,[]);const report={passed:checks.length,checks,errors,initialFontRequests:2,initialFontBytes:hotBytes,originalFontBytes:manifest.sourceBytes,allSubsetBytes:manifest.totalBytes,shards:manifest.subsets.length,renderComparison:same};
 await fs.writeFile(path.join(root,'reports/fonts_browser_checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
