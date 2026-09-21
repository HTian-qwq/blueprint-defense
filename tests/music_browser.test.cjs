const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),url=process.env.BLUEPRINT_WEB_URL||'http://127.0.0.1:8770/blueprint_defense.html';
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];try{
 const context=await browser.newContext({viewport:{width:1540,height:1060}}),page=await context.newPage(),requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 async function boot(){await page.goto(url);await page.waitForFunction(()=>window.BlueprintDefense?.music);await page.evaluate(()=>BlueprintDefense.ready);await page.evaluate(()=>BlueprintDefense.session.ready);await page.locator('#loadingScreen').waitFor({state:'hidden'});}
 const current=()=>page.evaluate(()=>{const m=BlueprintDefense.music;return {state:m.state,enabled:m.enabled,selection:m.selection,volume:m.volume,actualVolume:m.audio.volume,paused:m.audio.paused,time:m.audio.currentTime,duration:m.audio.duration,rate:m.audio.playbackRate,track:m.track?.id};});
 await boot();const urls=await page.evaluate(()=>BlueprintDefense.music.tracks.map(t=>new URL(t.src,location.href).href));assert(!requests.some(r=>urls.includes(r)));assert.equal(await page.evaluate(()=>BlueprintDefense.music.audio.getAttribute('src')),null);
 await page.locator('#menuNew').click();assert.equal(await page.evaluate(()=>BlueprintDefense.music.audio.getAttribute('src')),null);await page.locator('#startBtn').click();
 await page.waitForFunction(()=>BlueprintDefense.music.state==='playing'&&BlueprintDefense.music.audio.currentTime>.3);let s=await current();assert.equal(s.track,'battle-1');assert(Math.abs(s.duration-132)<.2);assert(!requests.includes(urls[1]));
 checks.push('no music is fetched on the menu or deployment screen; starting a wave streams only the first verified battle loop');
 await page.locator('#startBtn').click();const paused=await current();await page.waitForTimeout(220);assert((await current()).paused);assert(Math.abs((await current()).time-paused.time)<.04);
 await page.locator('#startBtn').click();await page.waitForFunction(time=>BlueprintDefense.music.audio.currentTime>time+.1,paused.time);await page.locator('#speedBtn').click();assert.equal((await current()).rate,1);
 await page.locator('#soundBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.sound.muted),true);assert(!(await current()).paused);
 await page.locator('#musicBtn').click();assert((await current()).paused);assert.equal((await current()).enabled,false);await page.locator('#musicBtn').click();await page.waitForFunction(()=>BlueprintDefense.music.state==='playing');
 checks.push('pause/resume preserves the playhead, 2x battle keeps music at 1x, and the music and SFX switches operate independently');
 await page.locator('#sessionBtn').click();await page.locator('#menuSettings').click();assert((await current()).paused);
 await page.locator('#settingsMusicVolume').fill('37');await page.locator('#settingsMusicVolume').dispatchEvent('input');await page.locator('#settingsMusicTrack').selectOption('battle-2');assert((await current()).paused);
 assert.match(await page.locator('#settingsMusicStatus').textContent(),/战斗音乐 02 · 继续战斗后播放/);
 await page.screenshot({path:path.join(root,'reports/music_settings.png')});await page.locator('#settingsClose').click();await page.locator('#menuReturn').click();await page.locator('#startBtn').click();
 await page.waitForFunction(()=>BlueprintDefense.music.track?.id==='battle-2'&&BlueprintDefense.music.state==='playing'&&BlueprintDefense.music.audio.currentTime>.2);s=await current();assert(Math.abs(s.duration-94.286)<.2);assert.equal(s.volume,.37);
 // Exercise the real media decoder's loop boundary, not a mocked timer.
 await page.evaluate(()=>{const a=BlueprintDefense.music.audio;a.currentTime=a.duration-.18;});await page.waitForFunction(()=>BlueprintDefense.music.audio.currentTime<2);assert.equal((await current()).state,'playing');
 await page.evaluate(()=>{const g=BlueprintDefense.game;g.intermission=20;BlueprintDefense.updateUI();});assert.equal((await current()).actualVolume,.185);
 checks.push('settings select and play the second original loop, the browser loops at its actual end, and preparation halves music volume');
 await page.locator('#sessionBtn').click();await page.locator('#menuSettings').click();await page.locator('#settingsMusicTrack').selectOption('auto');await page.locator('#settingsClose').click();await page.locator('#menuReturn').click();await page.locator('#startBtn').click();
 await page.evaluate(()=>{BlueprintDefense.game.wave=2;BlueprintDefense.game.intermission=0;BlueprintDefense.updateUI();});await page.waitForFunction(()=>BlueprintDefense.music.track.id==='battle-2');assert.equal((await current()).actualVolume,.37);
 // Visibility handler uses the same pause path on both desktop and mobile browsers.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert((await current()).paused);assert.equal(await page.evaluate(()=>BlueprintDefense.game.phase),'paused');
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});assert((await current()).paused);
 await page.locator('#sessionBtn').click();await boot();s=await current();assert.equal(s.volume,.37);assert.equal(s.selection,'auto');assert(s.paused);await page.locator('#menuContinue').click();assert((await current()).paused);
 checks.push('automatic selection follows waves; switching away pauses both battle and music; reload retains preferences without autoplaying the saved run');
 await page.locator('#sessionBtn').click();await page.locator('#menuSettings').click();await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(root,'reports/music_settings_phone.png')});
 checks.push('music controls remain usable at phone width without horizontal overflow');
 await context.close();
 const failed=await browser.newContext(),fp=await failed.newPage();fp.on('pageerror',e=>errors.push(e.message));
 await fp.route(urls[0],route=>route.abort('failed'));await fp.goto(url);await fp.waitForFunction(()=>window.BlueprintDefense?.music);await fp.evaluate(()=>BlueprintDefense.session.ready);await fp.locator('#loadingScreen').waitFor({state:'hidden'});await fp.locator('#menuNew').click();await fp.locator('#startBtn').click();await fp.waitForFunction(()=>BlueprintDefense.music.failed);
 assert.equal(await fp.evaluate(()=>BlueprintDefense.game.phase),'running');await fp.unroute(urls[0]);await fp.locator('#musicBtn').click();await fp.waitForFunction(()=>BlueprintDefense.music.state==='playing');assert.equal(await fp.evaluate(()=>BlueprintDefense.music.failed),false);
 checks.push('a failed music request does not interrupt gameplay and the visible retry successfully recovers playback');
 await failed.close();
 const offline=await browser.newContext(),op=await offline.newPage();op.on('pageerror',e=>errors.push(e.message));
 await op.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await op.evaluate(()=>BlueprintDefense.ready);await op.locator('#startBtn').click();
 await op.waitForFunction(()=>BlueprintDefense.music.state==='playing'&&BlueprintDefense.music.audio.currentTime>.2);assert(await op.evaluate(()=>BlueprintDefense.music.audio.src.startsWith('data:audio/mpeg;base64,')));
 assert(Math.abs(await op.evaluate(()=>BlueprintDefense.music.audio.duration)-132)<.2);await offline.close();
 checks.push('the offline single-file build plays the embedded original music without an HTTP server');
 assert.deepEqual(errors,[]);const report={passed:checks.length,checks,errors};await fs.writeFile(path.join(root,'reports/music_browser_checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
