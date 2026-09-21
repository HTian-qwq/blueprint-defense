const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),{line,tick}=require('./geometry_helpers.cjs');
const checks=[];function test(name,fn){fn();checks.push(name);}
const shell='item_crystal_shell',parts='item_iron_cmpt';
function fixture(){const g=new Game({...data,waves:[{name:'fixture',enemies:[0],gap:100,hp:1e6}],rules:{...data.rules,initialDP:500,maxDP:500}});return g;}
function fundResearch(g,id){const n=g.researchNode(id);g.warehouse={...g.warehouse,...n.materials};}
test('a normal run starts with no research, no stock, infinite unlocked raw ore and the original 40 DP',()=>{
 const g=new Game(data);assert.equal(g.dp,40);assert.equal(g.dpCapacity(),99);assert.deepEqual(g.researched,[]);assert.deepEqual(g.warehouse,{});assert.equal(g.warehouseCount('item_originium_ore'),Infinity);assert.equal(g.warehouseCount('item_iron_ore'),0);assert(g.deploy(0,1,1).tower);assert(g.deploy(2,4,1).tower);assert.match(g.deploy(8,22,19).error,/研究/);
});
test('unlimited construction really permits more than eight towers with original footprints',()=>{
 const g=fixture();for(let y=0;y<=2;y+=2)for(let x=0;x<20;x+=2){const r=g.deploy(0,x,y);assert(r.tower,r.error);}assert.equal(g.towers.length,20);assert.equal(g.dp,320);assert(g.deploy(0,0,0).error);
});
test('research checks prerequisites, actual stock and funds atomically; duplicate and parallel requests cannot double spend',()=>{
 const g=fixture(),before=JSON.stringify(g);assert(g.startResearch('ballistics').error);assert.equal(JSON.stringify(g),before);fundResearch(g,'storm');assert.match(g.startResearch('storm').error,/前置/);
 fundResearch(g,'ballistics');const dp=g.dp;assert(g.startResearch('ballistics').job);assert.equal(g.dp,dp-22);assert.equal(g.warehouseCount(shell),0);const after=JSON.stringify(g);assert(g.startResearch('ballistics').error);assert(g.startResearch('logistics').error);assert.equal(JSON.stringify(g),after);
});
test('research only progresses with running simulation, freezes on pause and resets with stock on every run',()=>{
 const g=fixture();fundResearch(g,'ballistics');g.startResearch('ballistics');g.advance(20);assert.equal(g.researchJob.remaining,15);g.start();g.advance(5);g.togglePause();const before=JSON.stringify(g);g.advance(60);assert.equal(JSON.stringify(g),before);g.togglePause();g.advance(10);assert(g.researched.includes('ballistics'));assert.equal(g.researchJob,null);assert.match(g.startResearch('ballistics').error,/完成/);g.reset();assert.deepEqual(g.researched,[]);assert.deepEqual(g.warehouse,{});assert.equal(g.researchJob,null);
});
test('storage research raises DP capacity during preparation; research persists across waves',()=>{
 const g=new Game({...data,waves:[{enemies:[],gap:1,hp:1},{enemies:[],gap:1,hp:1}]});fundResearch(g,'logistics');g.startResearch('logistics');g.start();g.advance(12);assert(g.isPreparing());assert.equal(g.dpCapacity(),200);g.nextWave();assert(g.researched.includes('logistics'));
});
test('supply modes settle each physical product once, hold material when changing mode, and route full-DP balanced deliveries to stock',()=>{
 const g=fixture(),p=g.deployProduction(3,1,19,3).unit;g.dp=0;
 p.cargo={kind:shell,age:1};g.setProductionOption(p.id,'warehouse');assert(p.cargo);tick(g,.05);assert.equal(g.dp,0);assert.equal(g.warehouseCount(shell),1);
 g.setProductionOption(p.id,'balanced');p.nextDelivery='dp';for(let i=0;i<4;i++){p.cargo={kind:shell,age:1};tick(g,.05);}assert.equal(g.dp,4);assert.equal(g.warehouseCount(shell),3);
 g.dp=500;p.cargo={kind:shell,age:1};tick(g,.05);assert.equal(g.warehouseCount(shell),4);assert.equal(g.dp,500);
 g.setProductionOption(p.id,'dp');p.cargo={kind:shell,age:1};tick(g,1);assert(p.cargo);g.setProductionOption(p.id,'warehouse');tick(g,.05);assert.equal(g.warehouseCount(shell),5);assert.equal(p.cargo,null);assert.equal(g.productionEarned,4);
});
test('a real original-recipe line can supply both research materials and deployment points, without minted rewards',()=>{
 const g=new Game(data);line(g);g.setProductionOption(g.production.find(p=>p.type===3).id,'balanced');tick(g,30);const box=g.production.find(p=>p.type===3);assert(box.delivered>=8);assert.equal(g.productionEarned/2+g.warehouseCount(shell),box.delivered);assert.equal(g.dp,27+g.productionEarned);assert.equal(data.production.recipes.slice(0,5).length,5);assert(data.production.recipes.slice(0,5).every(r=>r.period===2&&r.inputCount===1&&r.outputCount===1));
});
test('locked iron cannot fund research without smelting technology, even after many kills; practice is explicitly provisioned',()=>{
 const g=fixture();fundResearch(g,'electromagnetics');g.kills=500;assert.match(g.startResearch('electromagnetics').error,/蓝铁冶炼/);g.researched.push('blue_iron');assert(g.startResearch('electromagnetics').job);
 const p=new Game({...data,practiceResources:true});assert.equal(p.researched.length,data.economy.nodes.length);assert.equal(p.warehouseCount(parts),60);assert.equal(p.productionItemLock(parts),null);
});
test('build and refit consume materials exactly once; failed occupancy and locked upgrades leave resources intact',()=>{
 const g=fixture(),t=g.deploy(0,1,1).tower;g.warehouse[shell]=8;const before=JSON.stringify(g);assert.equal(g.upgrade(t.id),false);assert.equal(JSON.stringify(g),before);g.researched.push('ballistics');assert(g.upgrade(t.id));assert.equal(t.level,2);assert.equal(g.warehouseCount(shell),4);const dp=g.dp;assert(g.deploy(1,1,1).error);assert.equal(g.dp,dp);assert.equal(g.warehouseCount(shell),4);assert(g.deploy(1,4,1).tower);assert.equal(g.warehouseCount(shell),0);assert.match(g.deploy(1,7,1).error,/不足/);
});
test('a magazine is charged per volley, not per bullet; empty magazines wait and real stock resumes fire',()=>{
 const g=fixture(),t=g.deploy(0,1,1).tower;g.researched=['ballistics'];g.warehouse[shell]=4;g.upgrade(t.id);const e=g.spawn(0,10000),stats=g.stats(t);g.fire(t,stats,e);assert(t.awaitingSupply);assert.equal(g.pendingAttacks.length,0);assert.equal(t.cooldown,0);assert.equal(g.audioEvents.filter(e=>e.key.includes('fire')).length,0);
 g.warehouse[shell]=1;for(let i=0;i<stats.ammo.volleys;i++){g.fire(t,stats,e);assert.equal(t.ammoRemaining,stats.ammo.volleys-1-i);}assert.equal(g.warehouseCount(shell),0);const queued=g.pendingAttacks.length,shots=t.shots;g.fire(t,stats,e);assert(t.awaitingSupply);assert.equal(g.pendingAttacks.length,queued);assert.equal(t.shots,shots);g.warehouse[shell]=1;g.fire(t,stats,e);assert.equal(t.awaitingSupply,false);assert.equal(t.ammoRemaining,stats.ammo.volleys-1);
});
test('basic towers never consume ammo; advanced stages retain cadence with materially larger damage and W skill intact',()=>{
 const g=fixture(),t=g.deploy(0,1,1).tower,e=g.spawn(0,10000);for(let i=0;i<5;i++)g.fire(t,g.stats(t),e);assert(!t.awaitingSupply);assert.deepEqual(g.warehouse,{});
 const gun=data.towers[0];assert.equal(gun.upgrades[0].damage,gun.damage*3);assert.equal(gun.upgrades[1].damage,gun.damage*7);assert.equal(gun.upgrades[1].burst.weights.length,6);assert.equal(gun.upgrades[1].interval,2);assert.equal(data.towers[8].upgrades[0].damage,33000);assert.equal(data.towers[8].upgrades[0].audio.voice,'wisadel.attack');
});
test('refitting clears the old magazine and withdrawal never duplicates spent material or pending bullets',()=>{
 const g=fixture();g.researched=['blue_iron','ballistics','storm','densification'];g.warehouse={[shell]:20,[parts]:10,item_iron_enr_cmpt:6};const t=g.deploy(0,1,1).tower;g.upgrade(t.id);g.fire(t,g.stats(t),g.spawn(0,10000));assert(t.ammoRemaining>0);g.upgrade(t.id);assert.equal(t.ammoRemaining,0);const stock={...g.warehouse},spent=t.spent;assert.equal(g.withdraw(t.id),Math.floor(spent*.5));assert.deepEqual(g.warehouse,stock);assert.equal(g.pendingAttacks.length,0);assert.equal(g.withdraw(t.id),0);
});
const report={passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'../reports/economy_checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
