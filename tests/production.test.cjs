const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),reference=require('../sources/production_reference.json');
const {starterLine}=require('./helpers.cjs'),checks=[];
function test(name,fn){fn();checks.push(name);}
function factory(){const g=new Game(data);g.dp=99;g.kills=Math.max(...data.production.unlocks.map(r=>r.kills));return g;}
function tick(g,seconds,dt=.05){for(let i=0;i<Math.round(seconds/dt);i++){g.time+=dt;g.updateProduction(dt);}}
test('five recipes match source inputs, outputs, machines, counts and the Lua duration formula',()=>{
  assert.equal(data.production.recipes.length,5);
  for(const r of data.production.recipes){const original=reference.recipes[r.id];assert.equal(r.machineId,original.machineId);assert.deepEqual(original.ingredients,[{group:[{count:r.inputCount,id:r.input}]}]);assert.deepEqual(original.outcomes,[{group:[{count:r.outputCount,id:r.output}]}]);assert.equal(r.period,original.progressRound*reference.groups[original.formulaGroupId].msPerRound/1000);}
  assert.equal(data.production.types[0].period,3);assert.equal(data.production.types.some(p=>p.kind==="miner"),false);assert.equal(data.rules.dpPerSecond,0);
});
test('40 starting DP funds the starter line plus two guns, and the actual running game generates income',()=>{
  const g=new Game(data);starterLine(g);assert.equal(g.dp,27);assert(g.deploy(0,5,3).tower);assert(g.deploy(0,7,3).tower);assert.equal(g.dp,9);
  g.advance(20);assert.equal(g.productionEarned,0);g.start();g.advance(10);assert.equal(g.productionEarned,8);assert.equal(g.dp,17);
  g.togglePause();const before=JSON.stringify(g);g.advance(15);assert.equal(JSON.stringify(g),before);
});
test('unprocessed raw material cannot be delivered for DP',()=>{
  const g=factory();const mine=g.deployProduction(0,1,10).unit,store=g.deployProduction(3,1,9,3).unit;const before=g.dp;
  tick(g,30);assert.equal(g.dp,before);assert.equal(mine.cargo.kind,'item_originium_ore');assert.equal(store.cargo,null);assert.match(g.productionStatus(mine),/不接收/);
  assert(g.rotateProduction(mine.id));assert.match(g.productionStatus(mine),/仓库接口朝向不匹配/);
});
test('all five recipes produce their real item and exchange exactly its fan price',()=>{
  for(const recipe of data.production.recipes){const g=factory(),type=data.production.types.findIndex(d=>d.id===recipe.machineId),p=g.deployProduction(type,1,10).unit,store=g.deployProduction(3,2,10).unit;
    assert.equal(g.setProductionOption(p.id,recipe.id),'');p.cargo={kind:recipe.input,age:0};g.dp=0;
    tick(g,1.95);assert.equal(p.cargo.kind,recipe.input);assert.equal(store.cargo,null);tick(g,.05);assert.equal(store.cargo.kind,recipe.output);tick(g,.5);
    assert.equal(g.dp,data.production.items[recipe.output].value);assert.equal(store.delivered,1);
  }
});
test('blue iron passes through refinery then component machine for the full deep-processing chain',()=>{
  const g=factory();const m=g.deployProduction(0,1,10).unit,f=g.deployProduction(2,1,9,3).unit,c=g.deployProduction(5,1,8,3).unit,s=g.deployProduction(3,1,7,3).unit;
  g.setProductionOption(m.id,'item_iron_ore');g.setProductionOption(f.id,'furnance_iron_nugget_1');const before=g.dp;
  tick(g,8);assert.equal(s.delivered,1);assert.equal(g.dp-before,10);assert.equal(g.productionEarned,10);
});
test('right-angle routing, rotation, incompatible recipes and single-hop transfers preserve cargo',()=>{
  const g=factory(),a=g.deployProduction(1,1,10).unit,b=g.deployProduction(1,2,10,3).unit,c=g.deployProduction(2,2,9,3).unit;
  a.cargo={kind:'item_originium_ore',age:1};tick(g,.05);assert.equal(a.cargo,null);assert.equal(b.cargo.kind,'item_originium_ore');assert.equal(c.cargo,null);
  tick(g,.35);assert.equal(c.cargo.kind,'item_originium_ore');assert.equal(g.setProductionOption(c.id,'furnance_crystal_shell_1'),'');
  const held=JSON.stringify(c.cargo);g.rotateProduction(c.id);assert.equal(JSON.stringify(c.cargo),held);
  const wrong=factory();const m=wrong.deployProduction(0,1,10).unit,f=wrong.deployProduction(2,1,9,3).unit;wrong.setProductionOption(m.id,'item_iron_ore');tick(wrong,5);assert.equal(f.cargo,null);assert.match(wrong.productionStatus(m),/不接收/);
});
test('two inputs contend without cloning or deleting an item; saturated storage buffers whole rewards',()=>{
  const g=factory(),a=g.deployProduction(1,1,10).unit,b=g.deployProduction(1,2,9,1).unit,merge=g.deployProduction(1,2,10).unit,c=g.deployProduction(3,3,10).unit;
  a.cargo={kind:'item_crystal_shell',age:1};b.cargo={kind:'item_crystal_shell',age:1};g.dp=98;tick(g,1);
  assert.equal(g.dp,98);assert.equal(g.production.filter(p=>p.cargo).length,2);assert.match(g.productionStatus(c),/已满/);
  g.dp=95;tick(g,.05);assert.equal(g.dp,99);assert.equal(g.productionEarned,4);assert.equal(g.production.filter(p=>p.cargo).length,1);
  g.dp=0;tick(g,1);assert.equal(g.dp,4);assert.equal(g.productionEarned,8);
});
test('occupancy, bounds, full construction refund, terminal edits and reset preserve unrelated devices',()=>{
  const g=new Game(data),p=g.deployProduction(0,1,10).unit;assert(g.deploy(0,1,10).error);assert(g.deployProduction(1,1,10).error);assert(g.deployProduction(1,0,5).error);assert(g.deployProduction(1,-1,10).error);assert(g.deployProduction(1,1.5,10).error);
  const tower=g.deploy(0,2,2).tower;assert(g.deployProduction(1,3,3).error);assert.equal(g.removeProduction(p.id),2);assert.equal(g.removeProduction(p.id),0);assert.equal(g.dp,31);assert.equal(g.towers[0],tower);
  const belt=g.deployProduction(1,1,10).unit;g.phase='won';assert.equal(g.rotateProduction(belt.id),false);assert.equal(g.removeProduction(belt.id),0);assert(g.deployProduction(1,2,10).error);
  g.reset();assert.equal(g.production.length,0);assert.equal(g.productionEarned,0);assert.equal(g.dp,40);
});
fs.writeFileSync(path.join(__dirname,'../reports/production_checks.json'),JSON.stringify({passed:checks.length,checks},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
