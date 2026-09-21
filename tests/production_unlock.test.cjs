const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),{starterLine}=require('./helpers.cjs');
const checks=[],iron='item_iron_ore',ingot='item_iron_nugget',part='item_iron_cmpt',rule=data.production.unlocks[0];
function test(name,fn){fn();checks.push(name);}
function tick(g,seconds){for(let i=0;i<Math.round(seconds/.05);i++){g.time+=.05;g.updateProduction(.05);}}
function kill(g){const e=g.spawn(0,1);g.damage({type:0,kills:0},e,e.hp,true);return e;}
function unlock(g){while(g.kills<rule.kills)kill(g);}
test('49 actual kills leave the branch locked; kill 50 unlocks the whole blue-iron branch without granting items',()=>{
 const g=new Game(data);assert.equal(rule.kills,50);assert.equal(g.warehouseCount(iron),0);assert.equal(g.warehouseCount('item_originium_ore'),Infinity);assert.equal(g.warehouseCount('item_quartz_sand'),Infinity);
 for(let n=0;n<49;n++){kill(g);for(const item of [iron,ingot,part])assert(g.productionItemLock(item));assert.equal(g.warehouseCount(iron),0);}
 assert.equal(g.kills,49);const enemy=kill(g);assert.equal(g.kills,50);
 for(const item of [iron,ingot,part])assert.equal(g.productionItemLock(item),null);assert.equal(g.warehouseCount(iron),Infinity);assert.equal(g.warehouseCount(ingot),0);
 g.damage({type:0,kills:0},enemy,1000,true);assert.equal(g.kills,50);
});
test('locked choices are rejected by the model and preserve the previous configuration and buffered item',()=>{
 const g=new Game(data),out=g.deployProduction(0,1,10).unit,furnace=g.deployProduction(2,1,9,3).unit;
 out.cargo={kind:'item_quartz_sand',age:0};furnace.cargo={kind:'item_originium_ore',age:1};const before=JSON.stringify([out,furnace,g.warehouse]);
 assert.match(g.setProductionOption(out.id,iron),/未解锁.*0 \/ 50/);assert.match(g.setProductionOption(furnace.id,'furnance_iron_nugget_1'),/未解锁/);assert.equal(JSON.stringify([out,furnace,g.warehouse]),before);
 unlock(g);assert.equal(g.setProductionOption(out.id,iron),'');assert.equal(g.setProductionOption(furnace.id,'furnance_iron_nugget_1'),'');assert.equal(out.cargo,null);assert.equal(furnace.cargo,null);
});
test('stale or directly injected locked configurations cannot withdraw, process, transport or earn DP before the kill',()=>{
 const g=new Game(data),out=g.deployProduction(0,1,10).unit,furnace=g.deployProduction(2,1,9,3).unit,supply=g.deployProduction(3,1,8,3).unit;
 out.source=iron;out.work=2.9;furnace.recipe='furnance_iron_nugget_1';furnace.cargo={kind:iron,age:1.9};supply.cargo={kind:part,age:1};const before=g.dp;
 tick(g,30);assert.equal(out.cargo,null);assert.equal(out.work,0);assert.equal(furnace.cargo.kind,iron);assert.equal(furnace.cargo.age,1.9);assert.equal(supply.cargo.kind,part);assert.equal(g.dp,before);assert.equal(g.productionEarned,0);assert.match(g.productionStatus(out),/未解锁/);
 unlock(g);tick(g,.5);assert.equal(supply.delivered,1);assert.equal(g.dp-before,10);
});
test('damage and leaks never unlock blue iron; only an enemy whose health reaches zero counts',()=>{
 const g=new Game(data);g.start();const enemy=g.enemies[0]||g.spawn(0,1);g.damage({type:0,kills:0},enemy,1,true);assert.equal(g.kills,0);assert(g.productionItemLock(iron));
 enemy.progress=g.track.length+.1;g.step(.05);assert(g.leaked>=1);assert.equal(g.kills,0);assert(g.productionItemLock(iron));
});
test('unlocked blue iron rewards exceed the basic line and finite stock is not fabricated by unlocking',()=>{
 assert.equal(data.production.items[ingot].value,6);assert.equal(data.production.items[part].value,10);assert.equal(data.production.items.item_crystal_shell.value,4);
 for(const [kind,price] of [[ingot,6],[part,10]]){const g=new Game(data);unlock(g);const out=g.deployProduction(0,1,10).unit,supply=g.deployProduction(3,1,9,3).unit;assert.equal(g.setProductionOption(out.id,kind),'');tick(g,6);assert.equal(out.cargo,null);assert.equal(g.productionEarned,0);
  g.warehouse[kind]=1;g.dp=0;tick(g,4);assert.equal(g.warehouseCount(kind),0);assert.equal(supply.delivered,1);assert.equal(g.dp,price);tick(g,8);assert.equal(g.dp,price);
 }
});
test('a legal normal campaign reaches 50 kills using only ordinary production income',()=>{
 const g=new Game(data),plan=[[0,5,3],[2,7,3],[1,7,6],[4,11,6],[5,7,0],[6,5,6],[8,12,2],[3,14,0]];let next=0;starterLine(g);g.start();
 for(let i=0;i<12000&&g.phase==='running'&&g.kills<50;i++){
  assert(g.productionItemLock(iron));while(next<plan.length&&g.dp>=data.towers[plan[next][0]].cost)assert(g.deploy(...plan[next++]).tower);
  if(next===plan.length)for(const t of g.towers)if(!g.config.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);
  g.step(.05);
 }
 assert(g.kills>=50);assert.equal(g.warehouseCount(iron),Infinity);assert.equal(g.life,10);assert(g.productionEarned>0);
});
test('replay and a fresh boss-practice run lock the branch again and clear finite products',()=>{
 const g=new Game(data);unlock(g);g.warehouse[ingot]=3;g.reset();assert.equal(g.kills,0);assert(g.productionItemLock(iron));assert.equal(g.warehouseCount(iron),0);assert.equal(g.warehouseCount(ingot),0);
 const boss=new Game({...data,waves:data.bossPractice.waves,rules:{...data.rules,initialDP:500,maxDP:500}});for(let n=0;n<49;n++)kill(boss);assert(boss.productionItemLock(iron));kill(boss);assert.equal(boss.productionItemLock(iron),null);
});
fs.writeFileSync(path.join(__dirname,'../reports/production_unlock_checks.json'),JSON.stringify({passed:checks.length,checks},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
