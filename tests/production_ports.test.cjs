const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),source=require('../sources/production_ports_reference.json');
const vectors=[[1,0],[0,1],[-1,0],[0,-1]],checks=[];
function test(name,fn){fn();checks.push(name);}
function factory(){const g=new Game(data);g.dp=99;g.kills=Math.max(...data.production.unlocks.map(r=>r.kills));return g;}
function put(g,type,x,y,dir){const r=g.deployProduction(type,x,y,dir);assert(r.unit,r.error);return r.unit;}
function tick(g,seconds){for(let i=0;i<Math.round(seconds/.05);i++){g.time+=.05;g.updateProduction(.05);}}
test('solid port and warehouse sides agree with the original table, excluding unused liquid and DP-output ports',()=>{
  for(const d of data.production.types.filter(d=>source.buildings[d.id])){
    const b=source.buildings[d.id];
    for(const [field,runtime,input] of [['inputPorts','inputs',true],['outputPorts','outputs',false]]){
      const expected=d.kind==='supply'&&!input?[]:[...new Set(b[field].filter(p=>!p.isPipe).map(p=>(p.trans.rotation.y/90+(input?2:0)+2)%4))].sort();
      assert.deepEqual(d.ports[runtime],expected,d.id+' '+field);
    }
    if(['unloader','loader'].includes(d.kind))assert.equal(d.ports.warehouse,(b.roadAttachSide+2)%4);
  }
});
test('all four rotations of every receiving device accept only the visible solid input; belts retain side turns',()=>{
  let cases=0;
  for(const type of [1,2,3,4,5,8])for(let dir=0;dir<4;dir++)for(let side=0;side<4;side++){
    const g=factory(),target=put(g,type,8,4,dir),[dx,dy]=vectors[side],feed=put(g,1,8+dx,4+dy,(side+2)%4);
    const item=type===3?'item_crystal_shell':g.productionRecipe(target)?.input||'item_originium_ore';feed.cargo={kind:item,age:1};
    const accepts=type===1?side!==dir:side===(dir+2)%4;tick(g,.05);
    assert.equal(target.cargo?.kind||null,accepts?item:null,`type ${type}, dir ${dir}, source side ${side}`);
    assert.equal(feed.cargo?.kind||null,accepts?null:item);
    if(!accepts){tick(g,6);assert.equal(target.cargo,null);assert.equal(g.productionEarned,0);assert.equal(feed.cargo.kind,item);assert.match(g.productionStatus(feed),/朝向不匹配/);}
    cases++;
  }
  assert.equal(cases,96);
});
test('warehouse docking is directional for both withdrawal and deposit; incorrect rotation never consumes stock',()=>{
  for(let dir=0;dir<4;dir++){
    const g=factory(),out=put(g,0,1,10,dir),input=put(g,8,3,10,dir);
    g.warehouse.item_crystal_shell=2;g.setProductionOption(out.id,'item_crystal_shell');input.cargo={kind:'item_iron_nugget',age:0};tick(g,6);
    assert.equal(!!out.cargo,dir===3);assert.equal(g.warehouseCount('item_crystal_shell'),dir===3?1:2);
    assert.equal(g.warehouseCount('item_iron_nugget'),dir===1?1:0);assert.equal(!!input.cargo,dir!==1);
    if(dir!==3)assert.match(g.productionStatus(out),/仓库接口朝向不匹配/);
    if(dir!==1)assert.match(g.productionStatus(input),/仓库接口朝向不匹配/);
  }
});
test('the reported upward line cannot feed a sideways refinery; rotating the actual device restores production and income',()=>{
  const g=factory();for(const [type,y] of [[0,10],[1,9],[2,8],[1,7],[3,6]])put(g,type,1,y,type===2?0:3);
  const furnace=g.productionAt(1,8),feed=g.productionAt(1,9);g.dp=0;tick(g,18);
  assert.equal(furnace.cargo,null);assert.equal(g.productionEarned,0);assert.equal(feed.cargo.kind,'item_originium_ore');assert.match(g.productionStatus(furnace),/入口朝向不匹配/);
  for(let i=0;i<3;i++)assert(g.rotateProduction(furnace.id));tick(g,9);assert(g.productionEarned>=8);assert.equal(g.dp,g.productionEarned);
});
test('an incorrect output connection retains processed cargo; rotation preserves that cargo and delivers exactly once',()=>{
  const g=factory(),furnace=put(g,2,8,4,0),store=put(g,3,9,4,1);g.dp=0;furnace.cargo={kind:'item_originium_ore',age:0};tick(g,10);
  assert.equal(furnace.cargo.kind,'item_crystal_shell');assert.equal(store.cargo,null);assert.equal(g.dp,0);assert.match(g.productionStatus(furnace),/朝向不匹配/);
  const held=furnace.cargo;for(let i=0;i<3;i++)g.rotateProduction(store.id);assert.equal(furnace.cargo,held);tick(g,1);assert.equal(g.dp,4);assert.equal(store.delivered,1);assert.equal(furnace.cargo,null);
});
test('a belt cannot reverse into the previous output, send diagonally, or bypass item matching through a correct port',()=>{
  const g=factory(),a=put(g,1,8,4,0),opposed=put(g,1,9,4,2),diagonal=put(g,2,9,3,0);
  a.cargo={kind:'item_originium_ore',age:1};assert.equal(g.productionAccepts(opposed,'item_originium_ore',a),false);assert.equal(g.productionAccepts(diagonal,'item_originium_ore',a),false);
  tick(g,5);assert.equal(opposed.cargo,null);assert.equal(diagonal.cargo,null);assert.equal(a.cargo.kind,'item_originium_ore');
  g.removeProduction(opposed.id);const furnace=put(g,2,9,4,0);g.setProductionOption(furnace.id,'furnance_iron_nugget_1');tick(g,5);assert.equal(furnace.cargo,null);assert.match(g.productionStatus(a),/不接收此物品/);
});
test('changing an occupied outlet returns finite stock exactly once and resets extraction without changing other outlets',()=>{
  const g=factory(),out=put(g,0,1,10),other=put(g,0,2,10);g.warehouse.item_iron_nugget=1;
  g.setProductionOption(out.id,'item_iron_nugget');tick(g,3);assert.equal(g.warehouseCount('item_iron_nugget'),0);assert.equal(out.cargo.kind,'item_iron_nugget');
  const before=JSON.stringify(out);assert(g.setProductionOption(out.id,'invalid'));assert.equal(JSON.stringify(out),before);
  assert.equal(g.setProductionOption(out.id,'item_quartz_sand'),'');assert.equal(out.cargo,null);assert.equal(out.work,0);assert.equal(g.warehouseCount('item_iron_nugget'),1);
  g.setProductionOption(out.id,'item_quartz_sand');assert.equal(g.warehouseCount('item_iron_nugget'),1);assert.equal(other.source,'item_originium_ore');
  tick(g,2.95);assert.equal(out.cargo,null);tick(g,.05);assert.equal(out.cargo.kind,'item_quartz_sand');assert.equal(g.productionEarned,0);
});
test('changing a recipe returns the actual input or finished output, never grants unfinished output, and respects terminal state',()=>{
  const g=factory(),furnace=put(g,2,8,4),component=put(g,5,8,6);furnace.cargo={kind:'item_originium_ore',age:1.9};
  assert.equal(g.setProductionOption(furnace.id,'furnance_iron_nugget_1'),'');assert.equal(furnace.cargo,null);assert.equal(g.warehouseCount('item_crystal_shell'),0);
  furnace.cargo={kind:'item_iron_nugget',age:0};g.setProductionOption(furnace.id,'furnance_quartz_glass_1');assert.equal(g.warehouseCount('item_iron_nugget'),1);assert.equal(g.warehouseCount('item_quartz_glass'),0);
  component.cargo={kind:'item_iron_nugget',age:1};assert(g.setProductionOption(component.id,'furnance_quartz_glass_1'));assert.equal(component.cargo.kind,'item_iron_nugget');
  g.phase='won';const before=JSON.stringify(g);assert(g.setProductionOption(furnace.id,'furnance_crystal_shell_1'));assert.equal(JSON.stringify(g),before);
});
fs.writeFileSync(path.join(__dirname,'../reports/production_ports_checks.json'),JSON.stringify({passed:checks.length,directionalIntakeCases:96,checks},null,2));console.log(JSON.stringify({passed:checks.length,directionalIntakeCases:96,checks},null,2));
