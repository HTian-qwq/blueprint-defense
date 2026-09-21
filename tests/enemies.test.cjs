const {unitCombatData}=require('./helpers.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),checks=[];
function test(name,fn){fn();checks.push(name);}
function arena(){const g=new Game({...unitCombatData(data),waves:[{name:'fixture',enemies:[],gap:1,hp:1}]});g.dp=99;return g;}
test('infiltrator dodges once per cooldown; shaman blinks on surviving damage with its own cooldown',()=>{
  const g=arena(),t=g.deploy(0,1,4).tower,e=g.spawn(10,1);g.damage(t,e,20,true);assert.equal(e.hp,e.maxHp);g.damage(t,e,20,true);assert.equal(e.hp,e.maxHp-20);
  g.time=3.5;g.damage(t,e,20,true);assert.equal(e.hp,e.maxHp-20);
  const shaman=g.spawn(9,1);g.damage(t,shaman,10,true);assert.equal(shaman.progress,1.4);g.damage(t,shaman,10,true);assert.equal(shaman.progress,1.4);
  g.time+=7;g.damage(t,shaman,10,true);assert.equal(shaman.progress,2.8);g.time+=7;g.damage(t,shaman,10000,true);assert.equal(shaman.hp,0);assert.equal(shaman.progress,2.8);
});
test('death healing affects living nearby allies including Rodin, caps at max HP and fires once',()=>{
  const g=arena(),t=g.deploy(0,1,4).tower,healer=g.spawn(11,1),boss=g.spawn(12,1),near=g.spawn(0,1),dead=g.spawn(0,1),far=g.spawn(0,1);
  boss.hp=boss.maxHp/2;near.hp=near.maxHp-1;dead.hp=0;far.x=15;far.hp=1;g.damage(t,healer,10000,true);
  assert.equal(boss.hp,boss.maxHp*.65);assert.equal(near.hp,near.maxHp);assert.equal(dead.hp,0);assert.equal(far.hp,1);assert.equal(g.kills,1);
  const hp=boss.hp;g.damage(t,healer,10000,true);assert.equal(g.kills,1);assert.equal(boss.hp,hp);
});
test('shooter waits for its telegraph, suppresses only its target and cannot hit a replacement tower',()=>{
  const g=arena(),t=g.deploy(0,1,4).tower,e=g.spawn(8,10);g.time=3;g.updateEnemyAbilities();assert.equal(e.cast.targetId,t.id);assert.equal(t.disabledUntil,0);
  g.time=3.79;g.updateEnemyAbilities();assert.equal(t.disabledUntil,0);g.time=3.8;g.updateEnemyAbilities();assert(Math.abs(t.disabledUntil-5.2)<1e-8);
  g.time=e.nextCast;g.updateEnemyAbilities();const until=e.cast.until;g.withdraw(t.id);const replacement=g.deploy(0,1,4).tower;g.time=until;g.updateEnemyAbilities();assert.equal(replacement.disabledUntil,0);
});
test('Rodin telegraphs a stationary area, interrupts pending volleys, resumes fire after the disable',()=>{
  const g=arena(),t=g.deploy(0,1,4).tower,outside=g.deploy(0,12,4).tower,boss=g.spawn(12,2);g.start();g.time=4;g.updateEnemyAbilities();assert.equal(boss.cast.kind,'boss');
  const progress=boss.progress;g.step(.05);assert.equal(boss.progress,progress);g.fire(t,g.stats(t),boss);assert(g.pendingAttacks.length>0);
  g.time=5.2;g.updateEnemyAbilities();assert.equal(t.disabledUntil,7.2);assert.equal(outside.disabledUntil,0);assert.equal(g.pendingAttacks.length,0);
  const shots=t.shots;g.fire(t,g.stats(t),boss);assert.equal(t.shots,shots);g.time=7.2;g.fire(t,g.stats(t),boss);assert(t.shots>shots);
});
test('half health grants one shield and a faster second phase, with correct original audio pairs',()=>{
  const g=arena(),t=g.deploy(0,1,4).tower,boss=g.spawn(12,2);g.drainAudioEvents();g.time=4;g.updateEnemyAbilities();assert.equal(g.drainAudioEvents()[0].key,'rodin.charge');
  g.time=5.2;g.updateEnemyAbilities();assert(g.drainAudioEvents().some(e=>e.key==='rodin.slam'));g.damage(t,boss,boss.maxHp/2,true);
  assert.equal(boss.phase,2);assert.equal(boss.shield,Math.round(boss.maxHp*.25));const shield=boss.shield;g.damage(t,boss,10,true);assert.equal(boss.shield,shield-10);
  g.time=boss.nextCast;g.updateEnemyAbilities();assert.equal(boss.cast.radius,3);assert(g.drainAudioEvents().some(e=>e.key==='rodin.flameCharge'));
  g.time=boss.cast.until;g.updateEnemyAbilities();assert(g.drainAudioEvents().some(e=>e.key==='rodin.flame'));assert.equal(t.disabledUntil,g.time+2.6);
  const before=boss.progress;g.start();g.step(.05);assert(Math.abs(boss.progress-before-.4*1.2*.05)<1e-8);
});
test('pause freezes boss casts; killing during a cast cancels the pending area strike',()=>{
  const g=arena(),t=g.deploy(0,1,4).tower,boss=g.spawn(12,2);g.start();g.time=4;g.updateEnemyAbilities();g.togglePause();const before=JSON.stringify(g);g.advance(20);assert.equal(JSON.stringify(g),before);
  g.damage(t,boss,100000,true);assert.equal(g.bossOutcome,'defeated');assert.equal(boss.cast,null);g.time=7;g.updateEnemyAbilities();assert.equal(t.disabledUntil,0);assert(g.drainAudioEvents().some(e=>e.stopVoiceId==='boss'+boss.id));
});
test('Rodin escape deducts ten life and ends the battle; reset clears all boss state',()=>{
  const g=arena(),b=g.spawn(12,2);b.progress=g.track.length-.001;g.start();g.step(.05);assert.equal(g.phase,'lost');assert.equal(g.life,0);assert.equal(g.bossOutcome,'escaped');
  g.reset();assert.equal(g.boss,null);assert.equal(g.bossOutcome,'');assert.equal(g.life,10);
});
test('the two-wave Rodin practice is winnable with its legal initial budget',()=>{
  const g=new Game({...data,waves:data.bossPractice.waves,rules:{...data.rules,initialDP:500,maxDP:500}});
  for(const pos of [[0,5,3],[2,7,3],[1,7,6],[4,11,6],[5,7,0],[6,5,6],[8,12,2],[3,14,0]]){const t=g.deploy(...pos).tower;assert(t);while(!g.config.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);}
  g.start();g.advance(600);assert.equal(g.phase,'won');assert.equal(g.bossOutcome,'defeated');assert.equal(g.kills+g.leaked,g.total);assert.equal(g.total,64+g.reinforcements);assert(g.dp>=0);assert(g.life>0);
});
fs.writeFileSync(path.join(__dirname,'../reports/enemy_checks.json'),JSON.stringify({passed:checks.length,checks},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
