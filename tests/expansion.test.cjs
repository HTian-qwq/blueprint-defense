const {unitCombatData}=require('./helpers.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Game}=require('../src/engine.js');
const data=require('../src/data.json');
const {starterLine}=require('./helpers.cjs');
const checks=[];
function test(name,fn){fn();checks.push(name);}
function sandbox(){const g=new Game({...unitCombatData(data),waves:[{name:'test',enemies:[],gap:1,hp:1}]});g.dp=99;return g;}
function near(actual,expected){assert(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);}
test('nine base cards have four data-backed refit families and distinct tier artwork',()=>{
  assert.equal(data.towers.length,9);assert.equal(data.enemies.length,16);assert.equal(data.waves.length,10);
  const expected={0:['battle_turret_2','battle_turret_3'],1:['battle_cannon_2'],3:['battle_laser_2'],4:['battle_lightning_2']};
  for(const [index,ids] of Object.entries(expected)){
    const tower=data.towers[index];assert.deepEqual(tower.upgrades.map(t=>t.id),ids);
    const base=fs.readFileSync(path.join(__dirname,'../assets',tower.id+'.png'));
    for(const id of ids)assert.notDeepEqual(fs.readFileSync(path.join(__dirname,'../assets',id+'.png')),base);
  }
});
test('ground-only towers decline flying targets in actual targeting; four anti-air towers fire',()=>{
  for(let type=0;type<data.towers.length;type++){
    const g=sandbox(),t=g.deploy(type,1,4).tower;g.start();g.spawn(4,10);g.step(.05);
    assert.equal(t.shots,data.towers[type].targets==='ground'?0:1,data.towers[type].id);
  }
});
test('chain attack hits three distinct nearby enemies with attenuation, leaving distant enemies intact',()=>{
  const g=sandbox(),t=g.deploy(4,1,4).tower;
  for(const x of [2,3,4,8]){g.spawn(0,10);Object.assign(g.enemies.at(-1),{x,y:5,hp:1000});}
  g.fire(t,g.stats(t),g.enemies[0]);g.updateProjectiles(.2);
  [845,876,900.8,1000].forEach((v,i)=>near(g.enemies[i].hp,v));
  assert.equal(g.effects.at(-1).points.length,4);
});
test('acid reduces physical mitigation temporarily and never hits flying enemies',()=>{
  const g=sandbox(),t=g.deploy(6,1,4).tower;g.spawn(3,10);g.spawn(4,10);
  for(const e of g.enemies)Object.assign(e,{x:2,y:5,hp:2000});
  g.fire(t,g.stats(t),g.enemies[0]);g.updateProjectiles(.5);
  const e=g.enemies[0];assert.equal(e.armorBreakUntil,6);assert.equal(g.enemies[1].hp,2000);
  const before=e.hp;g.damage(t,e,76);near(before-e.hp,61.3);g.time=7;const expired=e.hp;g.damage(t,e,76);near(expired-e.hp,34);
});
test('fire damage lasts exactly three seconds, spares air units and credits one kill',()=>{
  const g=sandbox(),t=g.deploy(7,1,4).tower;g.spawn(0,10);g.spawn(4,10);
  for(const e of g.enemies)Object.assign(e,{x:2,y:5,hp:1000});
  g.fire(t,g.stats(t),g.enemies[0]);g.updateProjectiles(.2);
  for(let i=0;i<12;i++)g.updateZones(.25);
  near(g.enemies[0].hp,754);assert.equal(g.enemies[1].hp,1000);assert.equal(g.zones.length,0);
  g.enemies[0].hp=10;g.fire(t,g.stats(t),g.enemies[0]);g.updateProjectiles(.2);
  for(let i=0;i<12;i++)g.updateZones(.25);assert.equal(t.kills,1);assert.equal(g.kills,1);
});
test('refits change cadence bonuses and mechanics, enforce real stage limits and preserve paid refunds',()=>{
  const g=sandbox(),t=g.deploy(0,1,4).tower;g.spawn(0,100);
  assert(g.upgrade(t.id));assert.equal(g.stats(t).id,'battle_turret_2');
  const shots=[],launch=g.launchShot.bind(g);g.launchShot=(...args)=>{launch(...args);shots.push(g.projectiles.at(-1));};
  g.fire(t,g.stats(t),g.enemies[0]);g.updateProjectiles(.5);assert.deepEqual(shots.map(s=>s.empowered),[false,false,false,true]);
  near(shots[3].stats.damage,47.2);shots.length=0;assert(g.upgrade(t.id));
  g.fire(t,g.stats(t),g.enemies[0]);g.updateProjectiles(.5);assert.equal(shots[5].stats.mode,'splash');assert.equal(shots[5].kind,'single');assert(!g.upgrade(t.id));
  const refund=Math.floor(t.spent/2);assert.equal(g.withdraw(t.id),refund);assert.equal(g.withdraw(t.id),0);
  for(const type of [1,3,4]){const b=sandbox(),tower=b.deploy(type,1,4).tower;b.upgrade(tower.id);assert(!b.upgrade(tower.id));assert.equal(b.maxLevel(tower),2);}
  const b=sandbox(),c=b.deploy(1,1,4).tower;b.upgrade(c.id);b.spawn(0,10);b.fire(c,b.stats(c),b.enemies[0]);b.updateProjectiles(.5);assert.equal(b.zones[0].kind,'fire');
  const l=sandbox(),e=l.deploy(4,1,4).tower;l.upgrade(e.id);l.spawn(4,10);l.fire(e,l.stats(e),l.enemies[0]);l.updateProjectiles(.2);assert.equal(l.zones[0].kind,'electric');
  const before=l.enemies[0].hp;l.updateZones(.25);assert(l.enemies[0].hp<before);
});
test('sniper and high-energy laser prefer high threat over a more advanced normal enemy',()=>{
  for(const type of [5,3]){
    const g=sandbox(),t=g.deploy(type,5,3).tower;if(type===3)g.upgrade(t.id);
    g.start();g.spawn(0,10);g.enemies[0].progress=7;g.spawn(7,10);g.enemies[1].progress=4;g.step(.05);
    assert.equal(g.projectiles[0].targetId,g.enemies[1].id);
  }
});
test('shields absorb before health; wounded runners accelerate; bosses resist half of slow magnitude',()=>{
  const g=sandbox(),t=g.deploy(0,1,4).tower;g.spawn(5,1);const e=g.enemies[0],hp=e.hp;
  g.damage(t,e,100,true);assert.equal(e.hp,hp);assert.equal(e.shield,80);g.damage(t,e,100,true);assert.equal(e.shield,0);assert.equal(e.hp,hp-20);
  const b=sandbox();b.start();b.spawn(6,1);b.enemies[0].hp=50;b.spawn(7,1);b.enemies[1].slowUntil=100;b.step(.05);
  near(b.enemies[0].progress,1.03*1.65*.05);near(b.enemies[1].progress,.43*.7*.05);
});
test('all eight tower types can complete the expanded campaign with legal costs',()=>{
  const g=new Game(data),plan=[[0,5,3],[2,7,3],[1,7,6],[4,11,6],[5,7,0],[6,5,6],[8,12,2],[3,14,0]];let next=0;
  starterLine(g);
  function spend(){while(next<plan.length&&g.dp>=data.towers[plan[next][0]].cost){assert(g.deploy(...plan[next++]).tower);}if(next===plan.length)for(const t of g.towers)if(!g.config.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);}
  spend();g.start();for(let i=0;i<16000&&g.phase==='running';i++){spend();g.step(.05);}
  assert.equal(g.phase,'won',JSON.stringify({phase:g.phase,wave:g.wave,kills:g.kills,life:g.life}));assert.equal(new Set(g.towers.map(t=>t.type)).size,8);assert.equal(g.total,400+g.reinforcements);assert(g.reinforcements>0);
  console.log(JSON.stringify({expandedVictory:{life:g.life,kills:g.kills,leaked:g.leaked,time:g.time}}));
});
fs.writeFileSync(path.join(__dirname,'../reports/expansion_checks.json'),JSON.stringify({passed:checks.length,checks},null,2));
console.log(JSON.stringify({passed:checks.length,checks},null,2));
