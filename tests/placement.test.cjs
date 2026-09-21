const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{Game}=require('../src/engine.js'),data=require('../src/data.json');
const checks=[];function test(n,fn){fn();checks.push(n);}function arena(){return new Game({...data,rules:{...data.rules,initialDP:500,maxDP:500}});}
function put(g,type,x,y,dir){const r=g.deployProduction(type,x,y,dir);assert(r.unit,r.error);return r.unit;}
test('smart placement aligns a refinery to an existing output and respects explicit orientation and free placement',()=>{
 const g=arena();put(g,0,1,27,3);const p=g.suggestProduction(2,1,24,0);assert.equal(p.dir,3);assert(p.count>0);assert.equal(p.x,1);assert.equal(p.y,24);
 assert.equal(g.suggestProduction(2,1,24,0,{rotate:false}).dir,0);const free=g.suggestProduction(2,2,24,0,{snap:false});assert.deepEqual([free.x,free.y,free.dir],[2,24,0]);
 const shifted=g.suggestProduction(2,1,23,0);assert.equal(shifted.y,24);assert.equal(shifted.dir,3);assert.equal(Math.abs(shifted.x-1)+Math.abs(shifted.y-23),1);
});
test('warehouse docking and snapping never bypass collisions, map edges, core or enemy paths',()=>{
 const g=arena(),dock=g.suggestProduction(0,5,43,0);assert(dock.dock);assert.equal(dock.dir,3);assert.equal(g.productionPlacementError(0,dock.x,dock.y,dock.dir),'');
 for(const [x,y] of [[-5,-5],[100,100],[35,8],[19,4]]){const p=g.suggestProduction(2,x,y,0);if(!g.productionPlacementError(2,p.x,p.y,p.dir))assert(Math.abs(x-p.x)+Math.abs(y-p.y)<=1);}
});
test('an entire L-shaped route is validated and paid for once with continuous port orientation',()=>{
 const g=arena(),cells=[{x:10,y:22},{x:11,y:22},{x:12,y:22},{x:12,y:21},{x:12,y:20}],dp=g.dp;
 const result=g.deployBeltPath(cells);assert.equal(result.error,'');assert.equal(result.cost,5);assert.equal(g.dp,dp-5);assert.equal(g.production.length,5);assert.deepEqual(result.path.map(p=>p.dir),[0,0,3,3,3]);
 for(let i=1;i<cells.length;i++)assert(g.productionPortMatches(g.productionAt(cells[i-1].x,cells[i-1].y),g.productionAt(cells[i].x,cells[i].y)));
});
test('blocked, unaffordable, nonadjacent and self-intersecting paths cause no partial spending, rotation or construction',()=>{
 const g=arena();const old=put(g,1,10,22,1);put(g,2,12,20,0);
 for(const cells of [[{x:10,y:22},{x:11,y:22},{x:12,y:22}],[{x:1,y:1},{x:3,y:1}],[{x:1,y:1},{x:2,y:1},{x:1,y:1}]]){const before=JSON.stringify(g);assert(g.deployBeltPath(cells).error);assert.equal(JSON.stringify(g),before);}
 g.dp=0;const before=JSON.stringify(g);assert(g.deployBeltPath([{x:10,y:22},{x:11,y:22}]).error);assert.equal(JSON.stringify(g),before);assert.equal(old.dir,1);
});
test('existing belts can be reused at no cost, retain their physical cargo, and the endpoint aims at a downstream inlet',()=>{
 const g=arena(),old=put(g,1,10,22,1);old.cargo={kind:'item_crystal_shell',age:.2};const cargo=old.cargo;put(g,3,12,19,3);
 const r=g.deployBeltPath([{x:10,y:22},{x:11,y:22},{x:12,y:22}]);assert.equal(r.error,'');assert.equal(r.cost,2);assert.equal(old.dir,0);assert.equal(old.cargo,cargo);assert.equal(r.path.at(-1).dir,3);
});
test('moving and rotating a real rectangular port preserve inventory and only commit a valid footprint',()=>{
 const g=arena(),p=put(g,0,1,27,3);p.cargo={kind:'item_crystal_shell',age:2};p.work=1;p.delivered=8;
 const before={dp:g.dp,cargo:p.cargo,work:p.work,delivered:p.delivered};assert(!g.moveBuilding(p.id,8,20,0).error);assert.deepEqual(g.productionRect(p),{x:8,y:20,width:1,depth:3});assert.deepEqual({dp:g.dp,cargo:p.cargo,work:p.work,delivered:p.delivered},before);assert.equal(g.productionAt(1,27),undefined);assert.equal(g.productionAt(8,22),p);
 const invalid=JSON.stringify(g);assert(g.moveBuilding(p.id,33,7,3).error);assert.equal(JSON.stringify(g),invalid);assert(g.moveBuilding('warehouse-0',5,5).error);
});
test('moving a tower does not refund money, erase upgrades, clear suppression or reset ammunition/attack cooldown',()=>{
 const g=arena(),t=g.deploy(0,6,5).tower;g.researched=['ballistics'];g.warehouse.item_crystal_shell=10;g.upgrade(t.id);t.cooldown=1.5;t.disabledUntil=5;t.ammoRemaining=1;t.shots=9;const before=structuredClone(t),dp=g.dp;
 assert(!g.moveBuilding(t.id,12,6).error);assert.deepEqual({...t,x:before.x,y:before.y},before);assert.equal(g.dp,dp);assert.equal(g.towerAt(6,5),undefined);assert.equal(g.towerAt(13,7),t);
 const state=JSON.stringify(g);assert(g.moveBuilding(t.id,19,4).error);assert.equal(JSON.stringify(g),state);g.phase='lost';assert(g.moveBuilding(t.id,2,2).error);
});
const report={passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'../reports/placement_checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
