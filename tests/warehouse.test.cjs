const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),checks=[];
function test(name,fn){fn();checks.push(name);}
function factory(){const g=new Game(data);g.dp=99;g.kills=Math.max(...data.production.unlocks.map(r=>r.kills));return g;}
function tick(g,seconds){for(let i=0;i<Math.round(seconds/.05);i++){g.time+=.05;g.updateProduction(.05);}}
function put(g,type,x,y,dir){const result=g.deployProduction(type,x,y,dir);assert(result.unit,result.error);return result.unit;}
test('a free, complete bottom row is built in, cannot be removed, rebuilt, rotated or occupied by another device',()=>{
 const g=new Game(data);assert.equal(g.dp,40);assert.equal(g.warehouseLine.length,20);assert.equal(g.production.length,0);
 for(const p of g.warehouseLine){assert.equal(p.y,11);assert(g.warehouseConnections().has(p.id));assert.equal(g.removeProduction(p.id),0);assert.equal(g.rotateProduction(p.id),false);assert(g.deployProduction(1,p.x,p.y).error);assert(g.deploy(0,p.x,p.y).error);}
 assert(g.deployProduction(6,0,9).error);assert(g.deployProduction(7,1,9).error);assert.equal(g.dp,40);
 const online=put(g,0,2,10),offline=put(g,0,2,9);tick(g,3);assert.equal(online.cargo.kind,'item_originium_ore');assert.equal(offline.cargo,null);assert.match(g.productionStatus(offline),/未贴靠/);
});
test('all recipe raw materials can be withdrawn repeatedly without finite stock, mining or DP generation',()=>{
 assert.deepEqual(new Set(data.production.rawMaterials),new Set(['item_originium_ore','item_quartz_sand','item_iron_ore']));
 for(const item of data.production.rawMaterials){const g=factory(),out=put(g,0,1,10);assert.equal(g.setProductionOption(out.id,item),'');const before=g.dp;
  for(let i=0;i<40;i++){tick(g,3);assert.equal(out.cargo.kind,item);out.cargo=null;}
  assert.equal(g.warehouseCount(item),Infinity);assert.equal(g.warehouse[item],undefined);assert.equal(g.dp,before);assert.equal(g.productionEarned,0);
 }
});
test('finished goods are unavailable until deposited, then withdrawal moves exactly one real item',()=>{
 const g=factory(),input=put(g,8,0,10),out=put(g,0,2,10);g.setProductionOption(out.id,'item_iron_nugget');tick(g,6);assert.equal(out.cargo,null);assert.match(g.productionStatus(out),/库存不足/);
 input.cargo={kind:'item_iron_nugget',age:0};const before=g.dp;tick(g,.5);assert.equal(g.warehouseCount('item_iron_nugget'),1);assert.equal(input.delivered,1);assert.equal(g.dp,before);
 tick(g,3);assert.equal(g.warehouseCount('item_iron_nugget'),0);assert.equal(out.cargo.kind,'item_iron_nugget');tick(g,9);assert.equal(g.warehouseCount('item_iron_nugget'),0);
 out.cargo=null;tick(g,6);assert.equal(out.cargo,null);assert.equal(g.productionEarned,0);
});
test('competing outlets cannot clone a scarce finished item or drive stock negative',()=>{
 const g=factory(),a=put(g,0,1,10),b=put(g,0,2,10);for(const p of [a,b])g.setProductionOption(p.id,'item_iron_cmpt');g.warehouse.item_iron_cmpt=1;tick(g,12);
 assert.equal([a,b].filter(p=>p.cargo).length,1);assert.equal(g.warehouseCount('item_iron_cmpt'),0);assert.equal(a.cargo?.kind||b.cargo?.kind,'item_iron_cmpt');
});
test('offline deposit holds cargo; online deposit preserves warehouse stock through demolition and raw returns do not mint DP',()=>{
 const g=factory(),offline=put(g,8,1,9),input=put(g,8,1,10);offline.cargo={kind:'item_quartz_glass',age:0};tick(g,5);assert.equal(g.warehouseCount('item_quartz_glass'),0);assert(offline.cargo);
 input.cargo={kind:'item_quartz_glass',age:0};tick(g,.5);assert.equal(g.warehouseCount('item_quartz_glass'),1);
 input.cargo={kind:'item_quartz_sand',age:0};tick(g,.5);assert.equal(g.warehouseCount('item_quartz_sand'),Infinity);assert.equal(g.warehouse.item_quartz_sand,undefined);assert.equal(g.productionEarned,0);
 g.removeProduction(input.id);assert.equal(g.warehouseCount('item_quartz_glass'),1);
});
test('raw withdrawal, refining, deposit, remote withdrawal, component processing and DP delivery form a complete real production chain',()=>{
 const g=factory(),raw=put(g,0,1,10,3);const feed=put(g,1,1,9),furnace=put(g,2,2,9);put(g,1,3,9,1);const input=put(g,8,3,10);
 const iron=put(g,0,5,10,3),turn=put(g,1,5,9),component=put(g,5,6,9),supply=put(g,3,7,9);g.setProductionOption(raw.id,'item_iron_ore');g.setProductionOption(furnace.id,'furnance_iron_nugget_1');g.setProductionOption(iron.id,'item_iron_nugget');g.dp=0;
 tick(g,30);assert(input.delivered>=7);assert(supply.delivered>=5);assert.equal(g.dp,supply.delivered*10);assert.equal(g.productionEarned,g.dp);
 const inFlight=[iron,turn,component].filter(p=>p.cargo).length+(supply.cargo?1:0);assert.equal(input.delivered,g.warehouseCount('item_iron_nugget')+inFlight+supply.delivered);assert.equal(g.warehouseCount('item_iron_ore'),Infinity);
});
test('pause freezes transfer and stock; reset restores the permanent row and infinite raw supply but clears finished inventory',()=>{
 const g=new Game(data);put(g,0,1,10);g.start();g.advance(3);g.warehouse.item_crystal_shell=2;g.togglePause();const before=JSON.stringify(g);g.advance(10);assert.equal(JSON.stringify(g),before);
 g.reset();assert.deepEqual(g.warehouse,{});assert.equal(g.warehouseCount('item_crystal_shell'),0);assert.equal(g.warehouseCount('item_originium_ore'),Infinity);assert.equal(g.production.length,0);assert.equal(g.warehouseLine.length,20);assert.equal(g.dp,40);
});
fs.writeFileSync(path.join(__dirname,'../reports/warehouse_checks.json'),JSON.stringify({passed:checks.length,checks},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
