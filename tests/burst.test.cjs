// Historical combat/balance fixture: isolates unchanged attack, voice, facing and wave timing contracts.
// Current research, costs, magazines and campaign are covered by economy*.test.cjs.
const {unitCombatData}=require('./helpers.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Game}=require('../src/engine.js');
const data=require('./fixtures/v11_balance.json');
const audit=require('../sources/attack_pattern_audit.json');
const checks=[];
function test(name,fn){fn();checks.push(name);}
function setup(level=3){const g=new Game(unitCombatData(data));g.dp=99;const t=g.deploy(0,1,4).tower;while(t.level<level)g.upgrade(t.id);g.spawn(0,1000);return {g,t,e:g.enemies[0]};}
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('authored turret frames and coefficients match separately checked current-game byte envelopes',()=>{
  for(const t of [data.towers[0],...data.towers[0].upgrades]){
    const r=audit.towers[t.id];assert.deepEqual(t.burst,r.burst);
    assert.equal(r.currentVerification.envelopes.length,r.timelines.length);
    r.timelines.forEach((tl,i)=>{assert.equal(tl.start,r.currentVerification.envelopes[i].start);assert.equal(tl.end,r.currentVerification.envelopes[i].end);});
  }
});
test('one volley produces 4 / 4 / 6 distinct damage pulses on the original authored frames',()=>{
  for(let level=1;level<=3;level++){
    const {g,t,e}=setup(level),stats=g.stats(t),hits=[];g.fire(t,stats,e);let previous=e.hp;
    for(let frame=1;frame<=20;frame++){g.updateProjectiles(1/30);if(e.hp<previous){hits.push(frame);previous=e.hp;}}
    assert.deepEqual(hits,stats.burst.hitFrames);assert.equal(t.shots,stats.burst.weights.length);
    near(e.maxHp-e.hp,stats.damage-data.enemies[0].armor);
    assert.equal(g.pendingAttacks.length,0);assert.equal(g.projectiles.length,0);
  }
});
test('only the last Rainstorm round damages nearby enemies, with the 40 percent enhanced-round share',()=>{
  const {g,t,e}=setup();g.spawn(0,1000);const neighbor=g.enemies[1];Object.assign(neighbor,{x:e.x+.2,y:e.y});
  g.fire(t,g.stats(t),e);g.updateProjectiles(12/30);assert.equal(neighbor.hp,neighbor.maxHp);
  g.updateProjectiles(1/30);near(neighbor.maxHp-neighbor.hp,(g.stats(t).damage-data.enemies[0].armor)*.4);
  assert.equal(g.drainAudioEvents().filter(a=>a.key==='turret3.hitBomb').length,1);
});
test('coarse and fine projectile steps preserve burst damage and event order',()=>{
  function run(step){const {g,t,e}=setup();g.drainAudioEvents();g.fire(t,g.stats(t),e);for(let elapsed=0;elapsed<.6-1e-8;elapsed+=step)g.updateProjectiles(Math.min(step,.6-elapsed));return {hp:e.hp,keys:g.drainAudioEvents().map(a=>a.key),shots:t.shots};}
  const coarse=run(.1),fine=run(1/120);near(coarse.hp,fine.hp);assert.deepEqual(coarse.keys,fine.keys);assert.equal(coarse.shots,6);
});
test('the attack cycle remains two seconds while within-volley rounds stay rapid',()=>{
  const {g,t,e}=setup();g.start();g.fire(t,g.stats(t),e);g.advance(1.9);assert.equal(t.shots,6);g.advance(.15);assert(t.shots>=7&&t.shots<12);
});
test('pause freezes a pending burst; withdrawal cancels only the withdrawn tower future rounds',()=>{
  const {g,t,e}=setup();g.dp=99;const other=g.deploy(0,2,4).tower;g.start();g.fire(t,g.stats(t),e);g.fire(other,g.stats(other),e);
  g.togglePause();const snapshot=JSON.stringify(g);g.advance(3);assert.equal(JSON.stringify(g),snapshot);
  g.withdraw(t.id);assert.equal(g.towers.length,1);assert.equal(g.towers[0],other);assert(g.pendingAttacks.every(a=>a.owner===other));
  g.updateProjectiles(.5);assert.equal(other.shots,4);assert.equal(t.shots,1);
});
test('later rounds retarget a live enemy when the original target dies instead of wasting the entire volley',()=>{
  const {g,t,e}=setup(1);e.hp=1;g.spawn(0,100);const next=g.enemies[1];g.fire(t,g.stats(t),e);g.updateProjectiles(.3);
  assert(e.hp<=0);assert(next.hp<next.maxHp);assert.equal(t.shots,4);assert.equal(t.kills,1);
});
fs.writeFileSync(path.join(__dirname,'../reports/burst_checks.json'),JSON.stringify({passed:checks.length,checks},null,2));
console.log(JSON.stringify({passed:checks.length,checks},null,2));
