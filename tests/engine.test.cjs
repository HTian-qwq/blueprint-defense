const assert=require('node:assert/strict');
const {Game}=require('../src/engine.js');
const data=require('../src/data.json');
const {starterLine,unitCombatData}=require('./helpers.cjs');
const checks=[];
function test(name,fn){fn();checks.push(name);}
test('route continuity, occupancy, bounds and deployment deduction',()=>{
  const g=new Game(data);for(let i=1;i<g.path.length;i++)assert.equal(Math.abs(g.path[i].x-g.path[i-1].x)+Math.abs(g.path[i].y-g.path[i-1].y),1);
  assert(g.deploy(0,0,5).error);assert(g.deploy(0,-1,2).error);assert(g.deploy(data.towers.length,2,2).error);assert(g.deploy(0,2.5,2).error);
  assert(g.deploy(0,5,3).tower);assert.equal(g.dp,31);assert(g.deploy(0,5,3).error);g.dp=0;assert(g.deploy(1,6,3).error);
});
test('no passive DP and pause freezes the full state',()=>{
  const g=new Game(data);g.start();g.advance(3);assert.equal(g.dp,40);g.togglePause();const before=JSON.stringify(g);g.advance(12);assert.equal(JSON.stringify(g),before);
  g.togglePause();g.dp=98.9;g.advance(.2);assert.equal(g.dp,98.9);
});
test('upgrade price, maximum level, refund and no duplicate refund',()=>{
  const g=new Game(data);g.dp=99;const t=g.deploy(0,5,3).tower;assert(g.upgrade(t.id));assert.equal(t.level,2);assert.equal(g.stats(t).damage,118);
  assert(g.upgrade(t.id));assert(!g.upgrade(t.id));const expected=Math.floor(t.spent/2);assert.equal(g.withdraw(t.id),expected);assert.equal(g.withdraw(t.id),0);assert.equal(g.towers.length,0);
});
test('eight deployment slots enforced',()=>{const g=new Game(data);for(let x=0;x<8;x++){g.dp=99;assert(g.deploy(0,(x%5)*2,x<5?0:9).tower);}g.dp=99;assert(g.deploy(0,12,0).error);});
test('splash damages nearby enemies, slow persists and piercing ignores armor',()=>{
  const g=new Game(unitCombatData(data));g.dp=99;const c=g.deploy(1,5,3).tower;g.spawn(0,2);g.spawn(0,2);g.enemies[0].x=5;g.enemies[0].y=5;g.enemies[1].x=5.4;g.enemies[1].y=5;
  g.fire(c,g.stats(c),g.enemies[0]);assert(g.enemies.every(e=>e.hp===e.maxHp),'damage waits for impact');g.updateProjectiles(.5);assert(g.enemies.every(e=>e.hp<e.maxHp));
  const f=g.deploy(2,6,4).tower;g.fire(f,g.stats(f),g.enemies[0]);g.updateProjectiles(.4);assert(g.enemies.every(e=>e.slowUntil===3));
  const l=g.deploy(3,7,4).tower;const e=g.enemies[1];e.hp=1000;e.x=8.5;e.y=4.5;g.fire(l,g.stats(l),e);g.updateProjectiles(.25);assert.equal(e.hp,660);
});
test('no defense produces defeat; terminal state cannot change',()=>{
  const g=new Game(data);g.start();g.advance(400);assert.equal(g.phase,'lost');assert.equal(g.life,0);const before=JSON.stringify(g);g.advance(100);assert.equal(JSON.stringify(g),before);assert(g.deploy(0,5,3).error);
});
function play(){
  const g=new Game(data),plan=[[0,5,3],[2,7,3],[1,7,6],[4,11,6],[5,7,0],[6,5,6],[8,12,2],[3,14,0]];let next=0;
  starterLine(g);
  function spend(){
    while(next<plan.length&&g.dp>=data.towers[plan[next][0]].cost){const [kind,x,y]=plan[next++];assert(g.deploy(kind,x,y).tower);}
    if(next===plan.length)for(const t of g.towers)if(!g.config.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);
  }
  spend();g.start();for(let i=0;i<16000&&g.phase==='running';i++){spend();g.step(.05);}return g;
}
test('a legal affordable strategy completes every wave with victory',()=>{
  const g=play();assert.equal(g.phase,'won',JSON.stringify({phase:g.phase,wave:g.wave,life:g.life,kills:g.kills,time:g.time}));
  assert.equal(g.kills+g.leaked,g.total);assert(g.life>0);assert.equal(g.wave,data.waves.length-1);assert(g.towers.length<=8);assert(g.dp>=0);console.log(JSON.stringify({victory:{life:g.life,kills:g.kills,leaked:g.leaked,time:g.time}}));
});
test('the simulation is deterministic',()=>{const a=play(),b=play();assert.equal(JSON.stringify(a),JSON.stringify(b));});
console.log(JSON.stringify({passed:checks.length,checks},null,2));
