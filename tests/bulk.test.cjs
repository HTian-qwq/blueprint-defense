const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{Game}=require('../src/engine.js'),data=require('../src/data.json');
const checks=[];function test(name,fn){fn();checks.push(name);}function arena(){return new Game({...data,practiceResources:true,rules:{...data.rules,initialDP:500,maxDP:500}});}
function put(g,type,x,y,dir=3){const r=g.deployProduction(type,x,y,dir);assert(r.unit,r.error);return r.unit;}
function gun(g,x,y){const r=g.deploy(0,x,y);assert(r.tower,r.error);return r.tower;}
test('box selection intersects actual rotated footprints and excludes the protocol core and fixed warehouse',()=>{
 const g=arena(),p=put(g,0,1,43),f=put(g,2,1,40),t=gun(g,10,20),vertical=put(g,0,20,22,0);
 assert.deepEqual(g.buildingsInRect({x:2,y:39,width:1,depth:8}),[p.id,f.id]);assert.deepEqual(g.buildingsInRect({x:20,y:24,width:1,depth:1}),[vertical.id]);
 assert.deepEqual(g.buildingsInRect({x:0,y:44,width:64,depth:4}),[]);assert.deepEqual(g.buildingsInRect({x:33,y:5,width:9,depth:9}),[]);
 assert.deepEqual(g.buildingsInRect({x:12,y:20,width:1,depth:2}),[]);assert(g.buildingsInRect({x:0,y:0,width:64,depth:48}).includes(t.id));
});
test('a connected line moves across its old footprint atomically and preserves goods, recipes, directions and cost',()=>{
 const g=arena(),units=[put(g,0,1,43),put(g,2,1,40),put(g,3,1,37)];units[1].cargo={kind:'item_crystal_shell',age:.6};units[1].work=.8;units[1].buffer={item_originium_powder:2};units[1].processingIngredients={item_originium_ore:1};units[1].outputRemaining=2;
 const before=structuredClone(units),dp=g.dp,stock=JSON.stringify(g.warehouse),ids=units.map(p=>p.id);
 assert.equal(g.moveBuildings([...ids,ids[0]],1,0).error,'');assert.equal(g.dp,dp);assert.equal(JSON.stringify(g.warehouse),stock);
 for(let i=0;i<units.length;i++)assert.deepEqual({...units[i],x:units[i].x-1},before[i]);assert(g.placementConnections(units[0]).dock);assert(g.productionPortMatches(units[0],units[1]));assert(g.productionPortMatches(units[1],units[2]));
});
test('mixed tower and production groups may cross each others old cells without resetting upgrade or combat state',()=>{
 const g=arena(),t=gun(g,10,22),p=put(g,2,12,22);assert(g.upgrade(t.id));t.cooldown=2;t.disabledUntil=8;t.ammoRemaining=4;const before=structuredClone(t),stock=JSON.stringify(g.warehouse),dp=g.dp;
 assert.equal(g.moveBuildings([t.id,p.id],2,0).error,'');assert.deepEqual({...t,x:before.x},before);assert.equal(p.x,14);assert.equal(g.dp,dp);assert.equal(JSON.stringify(g.warehouse),stock);
});
test('blocked group moves never partly move buildings or charge money; all permanent obstacles are checked',()=>{
 const g=arena(),a=put(g,1,10,22),b=gun(g,12,22);put(g,2,17,22);const ids=[a.id,b.id];
 for(const [dx,dy] of [[5,0],[-20,0],[0,22],[23,-17],[-2,-12],[.5,0],[NaN,0]]){const before=JSON.stringify(g);assert(g.moveBuildings(ids,dx,dy).error,`${dx},${dy}`);assert.equal(JSON.stringify(g),before);}
 for(const invalid of [[],[a.id,999999],[a.id,g.warehouseLine[0].id],[a.id,'protocol-core']]){const before=JSON.stringify(g);assert(g.moveBuildings(invalid,1,0).error);assert.equal(JSON.stringify(g),before);}
 g.phase='lost';const before=JSON.stringify(g);assert(g.moveBuildings(ids,1,0).error);assert.equal(JSON.stringify(g),before);
});
test('bulk demolition refunds factory cost and upgraded tower investment once, clearing pending attacks without duplicating items',()=>{
 const g=arena(),p=put(g,2,5,22),t=gun(g,10,22),other=gun(g,15,22);assert(g.upgrade(t.id));p.buffer={item_crystal_shell:8};p.cargo={kind:'item_crystal_shell',age:0};g.pendingAttacks=[{owner:t},{owner:other}];
 const expected=data.production.types[p.type].cost+g.refundValue(t),dp=g.dp,stock=JSON.stringify(g.warehouse);
 const result=g.removeBuildings([p.id,t.id,p.id]);assert.equal(result.count,2);assert.equal(result.refund,expected);assert.equal(result.credited,expected);assert.equal(g.dp,dp+expected);assert.equal(JSON.stringify(g.warehouse),stock);assert.equal(g.production.length,0);assert.deepEqual(g.towers,[other]);assert.deepEqual(g.pendingAttacks,[{owner:other}]);assert.equal(g.warehouseLine.length,9);
 const after=JSON.stringify(g);assert(g.removeBuildings([p.id,t.id]).error);assert.equal(JSON.stringify(g),after);
});
test('refund preview matches actual available capacity and rejects stale, fixed or ended selections without partial deletion',()=>{
 const g=arena(),p=put(g,2,5,22),t=gun(g,10,22);g.dp=g.dpCapacity()-.5;assert.equal(g.bulkSelection([p.id,t.id]).credited,.5);
 for(const ids of [[p.id,9999],[t.id,'protocol-core'],[p.id,g.warehouseLine[0].id]]){const before=JSON.stringify(g);assert(g.removeBuildings(ids).error);assert.equal(JSON.stringify(g),before);}
 g.phase='won';const before=JSON.stringify(g);assert(g.removeBuildings([p.id]).error);assert.equal(JSON.stringify(g),before);g.phase='paused';const result=g.removeBuildings([p.id,t.id]);assert.equal(result.credited,.5);assert.equal(g.dp,g.dpCapacity());
});
const report={passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'../reports/bulk_checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
