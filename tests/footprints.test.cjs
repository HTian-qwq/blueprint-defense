const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),reference=require('../sources/tower_footprint_reference.json'),{pose}=require('../src/actors.js');
const checks=[];function test(name,fn){fn();checks.push(name);}
function game(){const g=new Game(data);g.dp=99;return g;}
test('all tower and upgrade footprints use original width/depth, never vertical height',()=>{
 for(const t of data.towers)for(const d of [t,...t.upgrades]){const r=reference.buildings[d.artId||d.id].originalRange;assert.deepEqual(d.footprint,{width:r.width,depth:r.depth});assert.deepEqual(d.footprint,t.footprint);}
 assert.deepEqual(data.towers[3].footprint,{width:2,depth:2});assert.equal(reference.buildings.battle_laser_1.originalRange.height,6);assert.deepEqual(data.towers[8].footprint,{width:3,depth:3});
});
test('every occupied cell blocks overlapping towers, while adjacent towers remain legal',()=>{
 const g=game(),a=g.deploy(0,5,3).tower;assert(a);
 for(let x=5;x<7;x++)for(let y=3;y<5;y++){assert.equal(g.towerAt(x,y),a);assert(g.deploy(0,x,y).error);}
 assert.equal(g.towerAt(7,4),undefined);assert(g.deploy(0,7,3).tower);
 const m=g.deploy(8,12,2).tower;assert(m);for(let x=12;x<15;x++)for(let y=2;y<5;y++)assert.equal(g.towerAt(x,y),m);
 assert(g.deploy(0,14,4).error);assert(g.deploy(0,15,0).tower);
});
test('non-anchor footprint cells reject road, map-edge and warehouse-row overlaps without charging DP',()=>{
 const g=game(),before=g.dp;
 for(const [type,x,y] of [[0,9,3],[0,19,0],[0,2,10],[8,8,3],[8,18,0],[8,12,9]])assert(g.deploy(type,x,y).error,`${type} at ${x},${y}`);
 assert.equal(g.dp,before);assert.equal(g.towers.length,0);
});
test('production and towers block one another across the full footprint and withdrawal releases every cell',()=>{
 const g=game(),p=g.deployProduction(1,6,4).unit;assert(p);assert(g.deploy(0,5,3).error);g.removeProduction(p.id);
 const t=g.deploy(0,5,3).tower;assert(t);assert(g.deployProduction(1,6,4).error);g.withdraw(t.id);assert(g.deployProduction(1,6,4).unit);
});
test('target range and projectile origin use the actual center of the 3x3 mortar',()=>{
 const g=game(),t=g.deploy(8,12,2).tower;assert.deepEqual(g.towerCenter(t),{x:13.5,y:3.5});
 const near=Object.assign(g.spawn(0,100),{x:19.74,y:3.5}),far=Object.assign(g.spawn(0,100),{x:19.76,y:3.5,progress:100});
 assert.equal(g.selectTarget(t,g.stats(t)),near);g.fire(t,g.stats(t),near);assert.equal(g.projectiles[0].x,13.5);assert.equal(g.projectiles[0].y,3.5);
 near.hp=0;assert.equal(g.selectTarget(t,g.stats(t)),undefined);assert(far.hp>0);
});
test('upgrades preserve occupied cells, failed resizing cannot charge, and reset clears occupancy',()=>{
 const g=game(),t=g.deploy(0,5,3).tower;assert(g.upgrade(t.id));assert.deepEqual(g.towerRect(t),{x:5,y:3,width:2,depth:2});assert.equal(g.towerAt(6,4),t);
 const config=structuredClone(data);config.towers[0].upgrades[0].footprint={width:3,depth:3};const custom=new Game(config);custom.dp=99;const unit=custom.deploy(0,8,3).tower;assert(unit);const dp=custom.dp;assert(!custom.upgrade(unit.id));assert.equal(custom.dp,dp);assert.equal(unit.level,1);
 g.reset();assert.equal(g.towerAt(6,4),undefined);
});
test('supplied actions map to deploy, idle, rotated attacks, stun and recovery on simulation time',()=>{
 const manifest=data.wisadel,t={animationStart:0,lastShotAt:-Infinity,shots:0,disabledUntil:0};assert.equal(pose(manifest,t,0).name,'idle','preparation shows a visible character');assert.equal(pose(manifest,t,.2).name,'start');assert.equal(pose(manifest,t,1).name,'begin');assert.equal(pose(manifest,t,3).name,'idle');
 for(const [n,name] of ['attackA','attackB','attackC','special'].entries()){t.shots=n+1;t.lastShotAt=10;assert.equal(pose(manifest,t,10.3).name,name);}
  t.disabledSince=10.5;t.disabledUntil=12;assert.equal(pose(manifest,t,11).name,'stun');assert.equal(pose(manifest,t,12.1).name,'recover');assert.equal(pose(manifest,t,16).name,'idle');
  t.lastShotAt=12.1;assert.equal(pose(manifest,t,12.2).name,'special','a fresh shot after suppression immediately animates');
 const g=game(),m=g.deploy(8,12,2).tower;g.dp=99;g.upgrade(m.id);g.start();g.advance(.2);g.togglePause();const before=pose(manifest,m,g.time);g.advance(20);assert.deepEqual(pose(manifest,m,g.time),before);
});
test('all used animation pages exist, registration is stable and empty exports are excluded',()=>{
 const manifest=data.wisadel,source=require('../sources/wisadel_animation_provenance.json');assert.equal(Object.keys(source.files).length,21);assert.equal(Object.keys(manifest.animations).length,9);
 assert.deepEqual(Object.keys(source.files).filter(k=>!source.files[k].valid),['Default','Skill_2_End','Skill_2_Overload_Begin']);
 for(const a of Object.values(manifest.animations)){assert(source.files[a.state].valid);assert(a.frames>0);assert.equal(a.pages.reduce((n,p)=>n+p.count,0),a.frames);assert(a.width>0&&a.height>0);for(const p of a.pages)assert(fs.existsSync(path.join(__dirname,'..',p.file)));}
});
fs.writeFileSync(path.join(__dirname,'../reports/footprints_checks.json'),JSON.stringify({passed:checks.length,checks},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
