const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const manifest={...require('../assets/audio/manifest.json'),...require('../assets/audio/wisadel_manifest.json')};
const clipCount=Object.values(manifest).reduce((n,clips)=>n+clips.length,0);
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1540,height:1060}}),errors=[],checks=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await page.evaluate(()=>BlueprintDefense.ready);
    assert.equal(await page.evaluate(()=>BlueprintDefense.sound.context),null);
    checks.push('no AudioContext or playback before a user gesture');
    await page.locator('#soundBtn').click();await page.waitForFunction(()=>BlueprintDefense.sound.state==='ready');
    await page.locator('#soundBtn').focus();await page.keyboard.press('Space');
    assert.equal(await page.evaluate(()=>BlueprintDefense.sound.muted),true);
    assert.equal(await page.evaluate(()=>BlueprintDefense.game.phase),'ready');
    await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>BlueprintDefense.sound.muted),false);
    const decoded=await page.evaluate(async()=>{
      const s=BlueprintDefense.sound;let count=0,minRms=1,maxPeak=0;
      for(const buffers of s.buffers.values())for(const b of buffers){
        const data=b.getChannelData(0);let square=0,peak=0;
        for(const x of data){if(!Number.isFinite(x))throw Error('Invalid audio sample');square+=x*x;peak=Math.max(peak,Math.abs(x));}
        minRms=Math.min(minRms,Math.sqrt(square/data.length));maxPeak=Math.max(maxPeak,peak);count++;
      }
      const offline=new OfflineAudioContext(1,32000,32000),source=offline.createBufferSource();
      source.buffer=s.buffers.get('turret.fire')[0];source.connect(offline.destination);source.start();
      const result=(await offline.startRendering()).getChannelData(0);
      return {count,minRms,maxPeak,renderedEnergy:result.reduce((v,x)=>v+x*x,0),context:s.context.state};
    });
    assert.equal(decoded.count,clipCount);assert.equal(decoded.context,'running');assert(decoded.minRms>.001);assert(decoded.maxPeak<1);assert(decoded.renderedEnergy>1);
    checks.push(`all ${clipCount} embedded MP3 clips decode to finite non-silent, unclipped audio; offline graph renders sound`);
    await page.evaluate(()=>{
      const g=BlueprintDefense.game;g.dp=99;[[0,1,2],[1,5,3],[2,7,4],[3,11,6]].forEach(([t,x,y])=>g.deploy(t,x,y));
    });
    await page.waitForTimeout(100);
    for(const tower of ['turret','cannon','frost','laser'])assert(await page.evaluate(t=>BlueprintDefense.sound.counts[t+'.deploy']>0,tower));
    await page.locator('#startBtn').click();
    await page.evaluate(()=>{const g=BlueprintDefense.game;g.spawn(0,100);const target=g.enemies.at(-1);for(const t of g.towers)g.fire(t,g.stats(t),target);});
    await page.waitForTimeout(750);
    let counts=await page.evaluate(()=>BlueprintDefense.sound.counts);
    for(const tower of ['turret','cannon','frost','laser']){assert(counts[tower+'.fire']>0,tower+' fire');if(tower!=='cannon')assert(counts[tower+'.hit']>0,tower+' impact');}
    assert(!counts['cannon.hit']);
    assert(counts['laser.charge']>0);
    checks.push('base deployment, launch, verified impact and laser charge create live Web Audio sources without a substituted cannon hit');
    await page.locator('#startBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.sound.voices.size),0);
    const paused=await page.evaluate(()=>BlueprintDefense.sound.played);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>BlueprintDefense.sound.played),paused);
    await page.locator('#soundBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.sound.muted),true);
    await page.locator('#startBtn').click();
    await page.evaluate(()=>{const g=BlueprintDefense.game;g.cue(g.towers[0],'fire',5);});await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>BlueprintDefense.sound.played),paused);
    await page.locator('#soundBtn').click();await page.waitForFunction(()=>!BlueprintDefense.sound.muted);
    await page.evaluate(()=>{const s=BlueprintDefense.sound;s.lastPlayed.clear();s.play('turret.fire',5);});
    assert(await page.evaluate(()=>BlueprintDefense.sound.voices.size>0));
    await page.locator('#resetBtn').click();assert.equal(await page.evaluate(()=>BlueprintDefense.sound.voices.size),0);
    checks.push('pause, mute and replay stop active sources; muted combat drops cues rather than replaying them later');
    await page.evaluate(()=>{const input=document.getElementById('volume');input.value='33';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.reload();await page.evaluate(()=>BlueprintDefense.ready);
    assert.equal(await page.locator('#volume').inputValue(),'33');assert.equal(await page.evaluate(()=>BlueprintDefense.sound.context),null);
    await page.locator('#soundBtn').click();await page.waitForFunction(()=>BlueprintDefense.sound.state==='ready');
    await page.evaluate(()=>{const s=BlueprintDefense.sound;for(let i=0;i<80;i++){s.lastPlayed.clear();s.play('cannon.fire',i%20);}});
    assert.equal(await page.evaluate(()=>BlueprintDefense.sound.voices.size),18);
    assert.equal(await page.evaluate(()=>[...BlueprintDefense.sound.voices].every(v=>v.source.playbackRate.value===1)),true);
    checks.push('volume persists, reloading stays silent, voice count is capped at 18 and playback pitch remains unchanged');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});BlueprintDefense.game.start();document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.evaluate(()=>BlueprintDefense.game.phase),'paused');assert.equal(await page.evaluate(()=>BlueprintDefense.sound.voices.size),0);
    await page.evaluate(()=>{delete document.hidden;BlueprintDefense.reset();});
    checks.push('background visibility transition stops all sound and pauses the match');
    await page.screenshot({path:path.join(root,'reports/audio_controls.png')});
    await page.evaluate(()=>{const g=BlueprintDefense.game;g.dp=99;[[4,1,2],[5,5,3],[6,7,4],[7,11,4]].forEach(([t,x,y])=>g.deploy(t,x,y));});
    await page.waitForTimeout(100);await page.locator('#startBtn').click();
    await page.evaluate(()=>{const g=BlueprintDefense.game;g.spawn(0,100);const e=g.enemies.at(-1);for(const t of g.towers)g.fire(t,g.stats(t),e);});
    await page.waitForTimeout(650);counts=await page.evaluate(()=>BlueprintDefense.sound.counts);
    for(const tower of ['lightning','sniper','debuff','trap'])for(const action of ['deploy','fire'])assert(counts[tower+'.'+action]>0,tower+'.'+action);
    assert(counts['lightning.hit']>0&&counts['sniper.hit']>0);assert(!counts['debuff.hit']&&!counts['trap.hit']);
    checks.push('new base towers dispatch verified deployment and attack cues without fabricated acid or flame impact cues');
    // Exercise every actual tower form, including in-flight upgrades and a sixth-shot bomb.
    for(let type=0;type<9;type++){
      await page.evaluate(type=>{BlueprintDefense.reset();const g=BlueprintDefense.game;g.dp=99;g.deploy(type,1,type===8?1:2);g.spawn(0,10000);},type);
      const max=await page.evaluate(()=>BlueprintDefense.game.maxLevel(BlueprintDefense.game.towers[0]));
      for(let level=1;level<=max;level++){
        if(level>1)await page.evaluate(()=>{const g=BlueprintDefense.game;g.dp=99;g.upgrade(g.towers[0].id);});
        await page.waitForTimeout(50);
        await page.evaluate(()=>{const g=BlueprintDefense.game,t=g.towers[0];g.fire(t,g.stats(t),g.enemies[0]);});
        await page.waitForTimeout(50);
        await page.evaluate(()=>BlueprintDefense.game.updateProjectiles(1.3));await page.waitForTimeout(60);
        if(type===7){
          const voiceId=await page.evaluate(()=>BlueprintDefense.game.zones[0].id);
          assert(await page.evaluate(id=>[...BlueprintDefense.sound.voices].some(v=>v.voiceId===id),voiceId));
          await page.evaluate(()=>BlueprintDefense.game.updateZones(3));await page.waitForTimeout(50);
          assert(!await page.evaluate(id=>[...BlueprintDefense.sound.voices].some(v=>v.voiceId===id),voiceId));
          assert(await page.evaluate(()=>BlueprintDefense.sound.counts['trap.end']>0));
        }
      }
    }
    await page.evaluate(()=>{BlueprintDefense.reset();const g=BlueprintDefense.game;g.spawn(g.config.enemies.findIndex(e=>e.boss),1);g.time=4;g.updateEnemyAbilities();});
    await page.waitForTimeout(70);
    await page.evaluate(()=>{const g=BlueprintDefense.game;g.time=5.3;g.updateEnemyAbilities();});await page.waitForTimeout(70);
    await page.evaluate(()=>{const g=BlueprintDefense.game,b=g.boss;b.phase=2;b.nextCast=g.time;g.updateEnemyAbilities();});await page.waitForTimeout(70);
    await page.evaluate(()=>{const g=BlueprintDefense.game;g.time+=1.1;g.updateEnemyAbilities();});await page.waitForTimeout(70);
    counts=await page.evaluate(()=>BlueprintDefense.sound.counts);
    for(const key of Object.keys(manifest))assert(counts[key]>0,`Never played: ${key}`);
    checks.push(`all ${Object.keys(manifest).length} cues create live sources through 14 original tower forms, the Wisadel refit and both Rodin phases, including the sixth-shot bomb`);
    checks.push('flame zone expiration stops its own start voice before playing the verified blast_end cue');
    await page.evaluate(()=>{
      const s=BlueprintDefense.sound;s.stopAll();s.lastPlayed.clear();s.play('trap.fire',2,9001);s.lastPlayed.clear();s.play('trap.fire',10,9002);
      s.consume([{key:'trap.end',x:2,time:0,stopVoiceId:9001}],true,0);
    });
    assert.deepEqual(await page.evaluate(()=>[...BlueprintDefense.sound.voices].filter(v=>v.key==='trap.fire').map(v=>v.voiceId)),[9002]);
    checks.push('ending one flame does not stop another tower flame; stop events also handle accelerated game time');
    // An unsupported browser still has a playable game.
    const fallback=await browser.newPage();await fallback.addInitScript(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined;});
    await fallback.goto(pathToFileURL(path.join(root,'dist/offline/blueprint_defense.html')).href);await fallback.locator('#soundBtn').click();
    await fallback.waitForFunction(()=>BlueprintDefense.sound.state==='failed');await fallback.locator('#startBtn').click();assert.equal(await fallback.evaluate(()=>BlueprintDefense.game.phase),'running');
    checks.push('audio API failure reports unavailable without preventing the game from running');
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(root,'reports/audio_checks.json'),JSON.stringify({passed:checks.length,checks,decoded,counts,errors},null,2));
    console.log(JSON.stringify({passed:checks.length,checks,decoded,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
