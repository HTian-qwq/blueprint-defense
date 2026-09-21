// Historical combat/balance fixture: isolates unchanged attack, voice, facing and wave timing contracts.
// Current research, costs, magazines and campaign are covered by economy*.test.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('./fixtures/v11_balance.json'),{pose}=require('../src/actors.js');
const checks=[];function test(name,fn){fn();checks.push(name);}
function setup(){const config=structuredClone(data);config.waves=[{name:'fixture',enemies:[],gap:1,hp:1}];config.enemies.forEach(e=>e.speed=0);const g=new Game(config);g.dp=99;const t=g.deploy(8,22,17).tower;assert(g.upgrade(t.id));const e=g.spawn(0,100000);t.cooldown=7;g.start();return {g,t,e};}
function locate(g,e,x){const px=x+.5,y=16.5,s=g.track.segments.find(s=>Math.abs(s.a.y-y)<1e-8&&Math.abs(s.b.y-y)<1e-8&&s.a.x<=px&&s.b.x>=px);assert(s,'road position');e.progress=s.start+px-s.a.x;Object.assign(e,g.point(e.progress));}
test('an active refit tracks left and right targets during its eight-second cooldown without firing',()=>{
 const {g,t,e}=setup();locate(g,e,21);g.advance(.05);assert.equal(t.facing,-1);assert.equal(t.aimTargetId,e.id);assert(t.aimAngle<0);assert.equal(t.shots,0);
 locate(g,e,26);g.advance(.05);assert.equal(t.facing,1);assert.equal(t.aimTargetId,e.id);assert.equal(t.shots,0);assert(Math.abs(t.aimAngle-Math.atan2(e.y-18.5,e.x-23.5))<1e-8);
});
test('targets passing almost vertically do not make the sprite flicker, but crossing the dead band turns it',()=>{
 const {g,t,e}=setup();locate(g,e,21);g.advance(.05);
 for(const x of [23.1,22.9,23.2,22.8]){locate(g,e,x);g.advance(.05);assert.equal(t.facing,-1);}
 locate(g,e,23.4);g.advance(.05);assert.equal(t.facing,1);
});
test('dead, airborne and out-of-range enemies do not aim the ground-only refit; idle retains the last facing',()=>{
 const {g,t,e}=setup();locate(g,e,21);g.advance(.05);const angle=t.aimAngle;e.hp=0;const air=g.spawn(4,100000);locate(g,air,26);g.spawn(0,100000);g.advance(.05);assert.equal(t.aimTargetId,null);assert.equal(t.facing,-1);assert.equal(t.aimAngle,angle);
});
test('pause and suppression freeze orientation and animation, then normal targeting resumes',()=>{
 const {g,t,e}=setup();locate(g,e,21);g.advance(.05);g.togglePause();const before=JSON.stringify(t),frame=pose(data.wisadel,t,g.time);g.advance(5);assert.equal(JSON.stringify(t),before);assert.deepEqual(pose(data.wisadel,t,g.time),frame);
 g.togglePause();g.disableTower(t,1);locate(g,e,26);g.advance(.5);assert.equal(t.facing,-1);assert.equal(pose(data.wisadel,t,g.time).name,'stun');g.advance(.55);assert.equal(t.facing,1);
});
test('a real shot faces its chosen target while retaining damage, cadence, projectile center and exactly one voice cue',()=>{
 const {g,t,e}=setup();g.drainAudioEvents();locate(g,e,21);t.cooldown=0;g.advance(.05);assert.equal(t.facing,-1);assert.equal(t.shots,1);assert.equal(t.cooldown,8);assert.equal(g.projectiles[0].x,23.5);assert.equal(g.projectiles[0].y,18.5);assert.equal(g.projectiles[0].stats.damage,33000);assert.equal(g.drainAudioEvents().filter(e=>e.key==='wisadel.attack').length,1);
 const second=g.spawn(0,100000);locate(g,second,26);g.advance(.05);assert.equal(t.facing,1);assert.equal(t.aimTargetId,second.id);assert.equal(t.shots,1);assert.equal(pose(data.wisadel,t,g.time).name,'attackA');
 const id=t.id;g.withdraw(id);assert(!g.towers.find(t=>t.id===id));g.reset();assert.equal(g.towers.length,0);
});
const result={passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'../reports/actor_facing_checks.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
