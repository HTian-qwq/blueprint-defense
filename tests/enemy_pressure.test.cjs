const {unitCombatData}=require('./helpers.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),{starterLine}=require('./helpers.cjs');
const checks=[];
function test(name,fn){fn();checks.push(name);}
function arena(){return new Game({...unitCombatData(data),waves:[{name:'fixture',enemies:[],gap:1,hp:1}],rules:{...data.rules,initialDP:99}});}
function kill(g,e){g.damage({type:0,kills:0},e,1e8,true);}
function complete(g,e){g.time=e.cast.until;g.updateEnemyAbilities();}
test('new enemies retain original identities and descriptions; campaign has 400 planned enemies and one Rodin',()=>{
  assert.equal(data.enemies.length,16);assert.deepEqual(data.enemies.slice(13).map(e=>e.id),['eny_0027_agscorp','eny_0055_hscrane','eny_0108_slbomb2']);
  for(const e of data.enemies.slice(13)){assert(e.reference.abilities.length);assert(e.reference.abilities.every(a=>a.description));assert(fs.existsSync(path.join(__dirname,'../assets',e.id+'.png')));}
  assert.deepEqual(data.waves.map(w=>w.enemies.length),[12,16,22,30,42,48,56,60,60,54]);assert.equal(data.waves.flatMap(w=>w.enemies).filter(t=>t===12).length,1);
});
test('summons arrive after a cast at the summoner position, count as real enemies, and stop after two casts',()=>{
  const g=arena(),e=g.spawn(13,2);e.progress=8;Object.assign(e,g.point(8));g.time=3;g.updateEnemyAbilities();assert.equal(e.cast.kind,'summon');assert.equal(g.reinforcements,0);
  complete(g,e);assert.equal(g.reinforcements,2);assert.equal(g.total,2);
  const children=g.enemies.filter(a=>a!==e);assert.deepEqual(children.map(a=>a.progress),[8,7.75]);assert(children.every(a=>a.type===2&&a.hp===Math.round(data.enemies[2].hp*2*.85)));
  g.time=e.nextCast;g.updateEnemyAbilities();complete(g,e);assert.equal(g.total,4);assert.equal(e.summons,2);
  g.time+=30;g.updateEnemyAbilities();assert.equal(e.cast,null);assert.equal(g.total,4);
  kill(g,e);g.start();g.step(.05);assert.equal(g.phase,'running','living children prevent premature victory');
  g.reset();assert.equal(g.reinforcements,0);assert.equal(g.waveReinforcements,0);assert.equal(g.total,0);
});
test('killing a summoner during its warning cancels future reinforcements; pause freezes its warning',()=>{
  const g=arena(),e=g.spawn(13,1);g.start();g.time=3;g.updateEnemyAbilities();g.togglePause();const before=JSON.stringify(g);g.advance(30);assert.equal(JSON.stringify(g),before);
  kill(g,e);g.time=10;g.updateEnemyAbilities();assert.equal(e.cast,null);assert.equal(g.total,0);assert.equal(g.reinforcements,0);
});
test('healer treats only the three most injured living nearby allies, including Rodin, and never revives or self-heals',()=>{
  const g=arena(),e=g.spawn(14,1),boss=g.spawn(12,1),a=g.spawn(0,1),b=g.spawn(0,1),c=g.spawn(0,1),dead=g.spawn(0,1),far=g.spawn(0,1);
  e.hp=1;boss.hp=boss.maxHp*.1;a.hp=a.maxHp*.2;b.hp=b.maxHp*.3;c.hp=c.maxHp*.4;dead.hp=0;far.hp=1;far.x=15;
  g.time=3;g.updateEnemyAbilities();assert.equal(e.cast.kind,'heal');complete(g,e);
  assert(Math.abs(boss.hp-boss.maxHp*.18)<1e-6);assert(Math.abs(a.hp-a.maxHp*.28)<1e-6);assert(Math.abs(b.hp-b.maxHp*.38)<1e-6);
  assert.equal(c.hp,c.maxHp*.4);assert.equal(dead.hp,0);assert.equal(far.hp,1);assert.equal(e.hp,1);
  g.enemies=[e,c];c.hp=c.maxHp-1;g.time=e.nextCast;g.updateEnemyAbilities();complete(g,e);assert.equal(c.hp,c.maxHp);
  c.hp=1;g.time=e.nextCast;g.updateEnemyAbilities();kill(g,e);g.time+=2;g.updateEnemyAbilities();assert.equal(c.hp,1);
});
test('ward shields only three living nearby allies, is capped across repeated casts, and absorbs damage',()=>{
  const g=arena(),e=g.spawn(5,1),allies=Array.from({length:4},()=>g.spawn(0,1)),far=g.spawn(0,1),dead=g.spawn(0,1);
  allies.forEach((a,i)=>a.progress=4-i);far.x=15;dead.hp=0;
  for(let n=0;n<5;n++){g.time=n?e.nextCast:3;g.updateEnemyAbilities();complete(g,e);}
  for(const a of allies.slice(0,3))assert.equal(a.shield,Math.round(a.maxHp*.16));assert.equal(allies[3].shield,0);assert.equal(far.shield,0);assert.equal(dead.shield,0);assert.equal(e.shield,e.baseMaxShield);
  const a=allies[0],hp=a.hp,shield=a.shield;g.damage({type:0,kills:0},a,10,true);assert.equal(a.hp,hp);assert.equal(a.shield,shield-10);
});
test('support wards cannot shrink Rodin phase-two intrinsic shield',()=>{
  const g=arena(),e=g.spawn(5,1),boss=g.spawn(12,1);g.damage({type:0,kills:0},boss,boss.maxHp*.5,true);const shield=boss.shield;
  g.time=3;g.updateEnemyAbilities();complete(g,e);assert.equal(boss.shield,shield);assert.equal(boss.maxShield,Math.round(boss.maxHp*.25));
  g.damage({type:0,kills:0},boss,30,true);g.time=e.nextCast;g.updateEnemyAbilities();complete(g,e);assert.equal(boss.shield,shield);
});
test('death explosion waits for its warning, interrupts nearby bursts only, is not duplicated, and delays victory',()=>{
  const g=arena(),near=g.deploy(0,1,4).tower,far=g.deploy(0,12,4).tower,e=g.spawn(15,1);g.start();g.fire(near,g.stats(near),e);assert(g.pendingAttacks.length);
  kill(g,e);assert.equal(g.enemyHazards.length,1);kill(g,e);assert.equal(g.enemyHazards.length,1);assert.equal(g.kills,1);
  g.advance(.6);assert.equal(near.disabledUntil,0);assert.equal(g.phase,'running');g.togglePause();const before=JSON.stringify(g);g.advance(30);assert.equal(JSON.stringify(g),before);g.togglePause();
  g.advance(1);assert.equal(g.enemyHazards.length,0);assert(Math.abs(near.disabledUntil-3.5)<1e-8);assert.equal(far.disabledUntil,0);assert.equal(g.pendingAttacks.length,0);assert.equal(g.phase,'won');
  g.reset();assert.equal(g.enemyHazards.length,0);
});
test('explosion actually cancels an in-progress volley and towers resume after its duration',()=>{
  const g=arena(),t=g.deploy(0,1,4).tower,e=g.spawn(15,1),target=g.spawn(0,100);kill(g,e);g.time=1.29;g.fire(t,g.stats(t),target);assert(g.pendingAttacks.length);
  g.time=1.3;g.updateEnemyHazards();assert.equal(g.pendingAttacks.length,0);const shots=t.shots;g.fire(t,g.stats(t),target);assert.equal(t.shots,shots);
  g.time=3.5;g.fire(t,g.stats(t),target);assert(t.shots>shots);
});
test('threat-priority towers pick support units while normal guns keep route priority',()=>{
  const g=arena(),t=g.deploy(0,1,4).tower,front=g.spawn(0,1),summoner=g.spawn(13,1),healer=g.spawn(14,1);front.progress=2;
  assert.equal(g.selectTarget(t,g.stats(t)),front);assert.equal(g.selectTarget(t,{...g.stats(t),highThreat:true}),healer);
  kill(g,healer);assert.equal(g.selectTarget(t,{...g.stats(t),mode:'snipe'}),summoner);
});
function campaign(plan,iron){
  const g=new Game(data);starterLine(g);let next=0,ironBuilt=false;g.start();
  for(let i=0;i<16000&&g.phase==='running';i++){
    if(iron&&!ironBuilt&&g.kills>=50&&g.dp>=18){
      for(const [type,y,option] of [[0,10,'item_iron_ore'],[2,9,'furnance_iron_nugget_1'],[5,8],[3,7]]){const u=g.deployProduction(type,3,y,3).unit;assert(u);if(option)assert.equal(g.setProductionOption(u.id,option),'');}ironBuilt=true;
    }
    while(next<plan.length&&g.dp>=data.towers[plan[next][0]].cost)assert(g.deploy(...plan[next++]).tower);
    if(next===plan.length)for(const t of g.towers)if(!g.config.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);
    g.step(.05);assert(g.dp>=0);
  }
  return {phase:g.phase,wave:g.wave+1,life:g.life,kills:g.kills,leaked:g.leaked,total:g.total,reinforcements:g.reinforcements,time:Math.round(g.time*100)/100,productionEarned:g.productionEarned,ironBuilt};
}
const mixed=[[0,5,3],[2,7,3],[1,7,6],[4,11,6],[5,7,0],[6,5,6],[8,12,2],[3,14,0]],previous=[[0,5,3],[0,7,3],[2,5,6],[0,14,6],[1,7,6],[3,12,4],[4,11,6],[1,5,0]];
const balance={planned:400,mixedBasic:campaign(mixed,false),mixedIron:campaign(mixed,true),clusteredGuns:campaign(previous,true)};
test('a mixed legal 40-DP strategy wins with either basic or iron income; a clustered gun-heavy strategy loses late',()=>{
  for(const r of [balance.mixedBasic,balance.mixedIron]){assert.equal(r.phase,'won');assert.equal(r.life,10);assert.equal(r.kills,r.total);assert.equal(r.total,400+r.reinforcements);assert(r.reinforcements>0);assert(r.productionEarned>0);}
  assert.equal(balance.mixedIron.ironBuilt,true);assert.equal(balance.clusteredGuns.phase,'lost');assert.equal(balance.clusteredGuns.wave,10);
});
fs.writeFileSync(path.join(__dirname,'../reports/enemy_pressure_balance.json'),JSON.stringify(balance,null,2));
fs.writeFileSync(path.join(__dirname,'../reports/enemy_pressure_checks.json'),JSON.stringify({passed:checks.length,checks},null,2));
console.log(JSON.stringify({passed:checks.length,checks,balance},null,2));
