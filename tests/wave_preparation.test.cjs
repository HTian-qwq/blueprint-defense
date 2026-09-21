// Historical combat/balance fixture: isolates unchanged attack, voice, facing and wave timing contracts.
// Current research, costs, magazines and campaign are covered by economy*.test.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('./fixtures/v11_balance.json'),baseline=require('./fixtures/v10_pressure_baseline.json'),{line,campaignPlan}=require('./geometry_helpers.cjs');
const checks=[];function test(name,fn){fn();checks.push(name);}function fixture(){const config=structuredClone(data);config.waves=[{name:'clear',enemies:[],gap:1,hp:1},{name:'next',enemies:[0,0],gap:1,hp:1}];return new Game(config);}function prepare(g){g.start();g.step(.05);assert(g.isPreparing());assert.equal(g.intermission,30);}
test('all ten waves have more enemies, denser spawning and higher HP; one Rodin remains in the final wave',()=>{
 assert.equal(data.waves.reduce((n,w)=>n+w.enemies.length,0),720);assert.deepEqual(data.waves.map(w=>w.enemies.length),[18,28,40,54,68,82,94,104,112,120]);
 data.waves.forEach((w,i)=>{assert(w.enemies.length>baseline.waves[i].enemies.length);assert(w.gap<baseline.waves[i].gap);assert(w.hp>baseline.waves[i].hp);});assert.equal(data.waves.flatMap(w=>w.enemies).filter(t=>t===12).length,1);assert.equal(data.waves[9].enemies[42],12);assert.equal(data.rules.intermission,30);
});
test('clearing a wave grants the full 30 seconds; no enemies arrive until its exact end and the timer cannot restart itself',()=>{
 const g=fixture();prepare(g);g.advance(29.9);assert.equal(g.wave,0);assert(g.intermission>0);assert.equal(g.enemies.length,0);g.advance(.1);assert.equal(g.wave,1);assert.equal(g.intermission,0);g.advance(.05);assert.equal(g.spawned,1);assert(!g.isPreparing());
});
test('flying projectiles and pending death blasts finish before preparation can begin',()=>{
 const g=fixture();g.dp=99;const t=g.deploy(8,22,17).tower,e=g.spawn(15,1);g.start();g.fire(t,g.stats(t),e);g.damage(t,e,e.hp+10000,true);g.step(.05);assert.equal(g.intermission,0);assert(g.enemyHazards.length);assert(g.projectiles.length);g.advance(1.15);assert.equal(g.intermission,0);g.advance(.15);assert(g.isPreparing());assert.equal(g.enemyHazards.length,0);assert.equal(g.projectiles.length,0);
});
test('production runs during preparation and is the only source of DP; items remain real across wave starts',()=>{
 const empty=fixture();prepare(empty);empty.advance(12);assert.equal(empty.dp,40);
 const g=fixture();line(g);prepare(g);g.advance(12);assert(g.productionEarned>=8);assert.equal(g.dp,27+g.productionEarned);const before=g.production.map(p=>JSON.stringify(p)),earned=g.productionEarned;assert(g.nextWave());assert.deepEqual(g.production.map(p=>JSON.stringify(p)),before);assert.equal(g.productionEarned,earned);
});
test('towers and production can be built, rotated, upgraded, reconfigured and removed during preparation',()=>{
 const g=fixture();prepare(g);g.dp=99;const t=g.deploy(0,17,5).tower;assert(t);assert(g.upgrade(t.id));const p=g.deployProduction(2,1,23,3).unit;assert(p);assert(g.rotateProduction(p.id));assert.equal(g.setProductionOption(p.id,'furnance_quartz_glass_1'),'');assert.equal(g.removeProduction(p.id),5);assert(g.withdraw(t.id)>0);assert(g.isPreparing());assert.equal(g.intermission,30);
});
test('pausing freezes preparation and manufacturing, retains building controls and prevents early launch until resumed',()=>{
 const g=fixture();line(g);prepare(g);g.advance(4);g.togglePause();const before=JSON.stringify(g);g.advance(40);assert.equal(JSON.stringify(g),before);assert.equal(g.nextWave(),false);assert(g.deploy(0,17,5).tower);g.togglePause();g.advance(1);assert(g.intermission<26);
});
test('early launch is idempotent, costs no DP, gives no reward and does not skip a second wave',()=>{
 const g=fixture();assert.equal(g.nextWave(),false);prepare(g);const dp=g.dp,time=g.time,kills=g.kills;assert(g.nextWave());assert.equal(g.nextWave(),false);assert.equal(g.wave,1);assert.equal(g.dp,dp);assert.equal(g.time,time);assert.equal(g.kills,kills);assert(!g.isPreparing());
});
test('preparation rate is always 1x, combat restores the selected rate and restart clears preparation',()=>{
 const g=fixture();assert.equal(g.simulationRate(2),2);prepare(g);assert.equal(g.simulationRate(2),1);g.nextWave();assert.equal(g.simulationRate(2),2);g.reset();assert.equal(g.wave,-1);assert.equal(g.intermission,0);assert(!g.isPreparing());assert.equal(g.phase,'ready');
});
test('the final wave ends in victory without an extra construction countdown; defeat cannot start another wave',()=>{
 const g=new Game({...data,waves:[{name:'final',enemies:[],gap:1,hp:1}]});g.start();g.step(.05);assert.equal(g.phase,'won');assert.equal(g.intermission,0);assert(!g.isPreparing());assert.equal(g.nextWave(),false);const h=fixture();h.phase='lost';h.intermission=30;assert(!h.isPreparing());assert.equal(h.nextWave(),false);
});
const previousPlan=[[0,9,8],[0,10,5],[2,17,5],[3,18,8],[4,17,11],[1,21,13],[8,22,17],[5,18,17]];
function run(config,plan){const g=new Game(config);line(g);let n=0,peak=0,preparations=0,wasPreparing=false;g.start();for(let i=0;i<40000&&g.phase==='running';i++){
 while(n<plan.length&&g.dp>=data.towers[plan[n][0]].cost){const r=g.deploy(...plan[n++]);assert(r.tower,r.error);}if(n===plan.length)for(const t of g.towers)if(!data.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);g.step(.05);peak=Math.max(peak,g.enemies.length);if(g.isPreparing()&&!wasPreparing)preparations++;wasPreparing=g.isPreparing();}
 return {phase:g.phase,wave:g.wave+1,life:g.life,kills:g.kills,total:g.total,leaked:g.leaked,peak,preparations,time:Math.round(g.time*100)/100};}
const balance={baseline:run({...data,waves:baseline.waves,rules:{...data.rules,intermission:baseline.intermission}},previousPlan),previousUnderPressure:run(data,previousPlan),layeredDefense:run(data,campaignPlan)};
test('pressure is observable in actual simulation: the previous winning defense fails, but ordinary layered defenses can still win',()=>{
 assert.equal(balance.baseline.phase,'won');assert.equal(balance.previousUnderPressure.phase,'lost');assert.equal(balance.layeredDefense.phase,'won');assert(balance.layeredDefense.life>0&&balance.layeredDefense.life<10);assert(balance.layeredDefense.peak>balance.baseline.peak*1.5);assert.equal(balance.layeredDefense.preparations,9);
});
const result={passed:checks.length,checks,balance};fs.writeFileSync(path.join(__dirname,'../reports/wave_preparation_checks.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
