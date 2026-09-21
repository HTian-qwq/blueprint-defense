// Historical combat/balance fixture: isolates unchanged attack, voice, facing and wave timing contracts.
// Current research, costs, magazines and campaign are covered by economy*.test.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('./fixtures/v11_balance.json');
const checks=[],type=data.towers.findIndex(t=>t.id==='battle_rocket_1');
function test(name,fn){fn();checks.push(name);}
const combatMap={...data.map,core:undefined,corners:[[0,5],[19,5]]};
function arena(){return new Game({...data,map:combatMap,waves:[{name:'fixture',enemies:[],gap:1,hp:1}],rules:{...data.rules,initialDP:99}});}
test('mortar retains original range and cadence; the refit describes its combat effect',()=>{
 assert.equal(type,8);const d=data.towers[type];assert.equal(d.range,6.25);assert.equal(d.interval,8);assert.equal(d.reference.chargeInterval,8);assert(d.reference.originalDescription.includes('33000'));
 const mod=d.upgrades[0];assert.equal(mod.artId,d.id);assert.equal(mod.easterEgg,true);assert.equal(mod.damage,33000);assert.equal(mod.cost,64);assert(mod.desc.includes('33000 点物理伤害'));assert(!/彩蛋|氦气|娱乐/.test(mod.role+mod.desc));
});
test('mortar deals physical area damage on arrival only, without hitting flying or out-of-radius units',()=>{
 const g=arena(),t=g.deploy(type,1,1).tower,enemy=(type,x)=>Object.assign(g.spawn(type,100),{x,y:5.5});
 const a=enemy(3,2),b=enemy(0,3.99),far=enemy(0,4.01),air=enemy(4,2);const before=[a,b,far,air].map(e=>e.hp);
 g.fire(t,g.stats(t),a);assert.equal(g.projectiles[0].kind,'mortar');g.updateProjectiles(1.2);assert.deepEqual([a,b,far,air].map(e=>e.hp),before);
 g.updateProjectiles(.05);assert.equal(a.hp,before[0]-1400+data.enemies[3].armor);assert.equal(b.hp,before[1]-1400+data.enemies[0].armor);assert.equal(far.hp,before[2]);assert.equal(air.hp,before[3]);
});
test('eight-second cadence runs through the simulation and suppression prevents launches',()=>{
 const config=structuredClone(data);config.map=combatMap;config.waves=[{name:'fixture',enemies:[],gap:1,hp:1}];config.enemies[0].speed=0;
 const g=new Game(config),t=g.deploy(type,1,1).tower;g.spawn(0,1000);g.start();g.advance(7.9);assert.equal(t.shots,1);g.advance(.2);assert.equal(t.shots,2);
 g.disableTower(t,10);g.advance(8);assert.equal(t.shots,2);g.advance(2.1);assert.equal(t.shots,3);
});
test('refit enforces its 64-DP cost, existing slot cap, maximum stage and paid refund',()=>{
 const g=arena(),t=g.deploy(type,1,1).tower;assert.equal(g.dp,67);assert.equal(g.upgradeCost(t),64);g.dp=63;assert(!g.upgrade(t.id));g.dp=64;assert(g.upgrade(t.id));assert.equal(g.dp,0);assert.equal(t.spent,96);assert(!g.upgrade(t.id));assert.equal(g.withdraw(t.id),48);assert.equal(g.withdraw(t.id),0);
});
test('each refit launch queues one battle line, deployment uses its own clip, and flight keeps pre-refit stats',()=>{
 const g=arena(),t=g.deploy(type,1,1).tower,e=g.spawn(0,1000);g.drainAudioEvents();g.fire(t,g.stats(t),e);const old=g.projectiles[0];assert.equal(g.drainAudioEvents().filter(e=>e.key==='wisadel.attack').length,0);
 assert(g.upgrade(t.id));assert.deepEqual(g.drainAudioEvents().map(e=>e.key),['wisadel.deploy']);assert.equal(old.stats.damage,1400);
 g.fire(t,g.stats(t),e);assert.equal(g.drainAudioEvents().filter(e=>e.key==='wisadel.attack').length,1);g.updateProjectiles(1.25);assert.equal(g.drainAudioEvents().filter(e=>e.key==='wisadel.attack').length,0);
 g.disableTower(t,2);g.fire(t,g.stats(t),e);assert.equal(g.drainAudioEvents().filter(e=>e.key==='wisadel.attack').length,0);
});
test('overpowered refit destroys a clustered ground group including Rodin but cannot damage an air enemy',()=>{
 const g=arena(),t=g.deploy(type,1,1).tower;assert(g.upgrade(t.id));const boss=g.spawn(12,2.2),group=[boss,g.spawn(3,2.2),g.spawn(5,2.2)],air=g.spawn(4,1);g.fire(t,g.stats(t),boss);g.updateProjectiles(1.25);
 assert(group.every(e=>e.hp===0));assert.equal(g.bossOutcome,'defeated');assert.equal(g.kills,3);assert.equal(air.hp,air.maxHp);
});
const audio=require('../sources/wisadel_audio_provenance.json');
test('all nine transformed recordings preserve duration and original copies and are non-silent without clipping',()=>{
 assert.equal(audio.clips.length,9);assert.equal(audio.tempo,1);assert(Math.abs(audio.semitones-8.6696)<.001);const hash=f=>require('node:crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 for(const r of audio.clips){assert(Math.abs(r.original.seconds-r.processed.seconds)<.12);assert(r.processed.rms>.001&&r.processed.peak<.9);assert.equal(hash(path.join(__dirname,'..',r.sourceCopy)),r.sourceSha256);assert.equal(hash(path.join(__dirname,'..',r.file)),r.sha256);}
});
fs.writeFileSync(path.join(__dirname,'../reports/mortar_checks.json'),JSON.stringify({passed:checks.length,checks},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
