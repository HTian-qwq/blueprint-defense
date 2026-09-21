const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),session=require('../src/session.js');
const checks=[],dirs=[[1,0],[0,1],[-1,0],[0,-1]],raw='item_originium_ore',finished='item_crystal_shell';
function test(name,fn){fn();checks.push(name);}
const arena=()=>new Game({...data,rules:{...data.rules,initialDP:500,maxDP:500}});
function tick(g,seconds){for(let i=0;i<Math.round(seconds*60);i++)g.updateProduction(1/60);}
function connect(g,p,dir=p.corePort==='outputs'?p.side:(p.side+2)%4){const [dx,dy]=dirs[p.side],r=g.deployProduction(1,p.x+dx,p.y+dy,dir);assert(r.unit,r.error);return r.unit;}
test('core ports retain all fourteen original inputs and six outputs at native artwork coordinates',()=>{
 const original=JSON.parse(fs.readFileSync(path.join(__dirname,'../sources/game_data/tables/FactoryBuildingTable.json'),'utf8')).sp_hub_1,g=arena(),core=data.map.core;
 assert.equal(g.corePorts.length,20);
 for(const kind of ['inputs','outputs'])for(const p of original[kind==='inputs'?'inputPorts':'outputPorts']){
  const port=g.corePorts.find(n=>n.corePort===kind&&n.index===p.index);
  assert.deepEqual([port.x,port.y,port.side],[core.x+p.trans.position.x,core.y+8-p.trans.position.z,(p.trans.rotation.y/90+(kind==='inputs'?2:0)+3)%4]);
 }
 assert(g.corePorts.every(p=>!g.productionStatus(p).includes('未贴靠')));
 assert.equal(g.production.length,0);assert.equal(g.placedBuildings().length,0);
});
test('each of the six outputs sends infinite unlocked raw material to its adjacent outward belt',()=>{
 for(let index=0;index<6;index++){
  const g=arena(),p=g.corePorts.find(p=>p.corePort==='outputs'&&p.index===index),belt=connect(g,p);
  tick(g,4);assert.equal(belt.cargo,null);assert.equal(g.setProductionOption(p.id,raw),'');tick(g,3.1);
  assert.equal(belt.cargo.kind,raw);assert.equal(p.delivered,1);assert.equal(g.warehouseCount(raw),Infinity);
 }
});
test('top and bottom inputs deposit finished items once, respecting the protected enemy entrance',()=>{
 let tested=0,protectedEntrance=0;
 for(const spec of arena().corePorts.filter(p=>p.corePort==='inputs')){
  const g=arena(),p=g.corePorts.find(p=>p.id===spec.id),[dx,dy]=dirs[p.side];
  if(g.road.has(`${p.x+dx},${p.y+dy}`)){protectedEntrance++;continue;}
  const belt=connect(g,p),dp=g.dp;belt.cargo={kind:finished,age:1};tick(g,2);
  assert.equal(g.warehouseCount(finished),1);assert.equal(p.delivered,1);assert.equal(g.dp,dp);assert.equal(belt.cargo,null);tick(g,2);assert.equal(g.warehouseCount(finished),1);tested++;
 }
 assert.equal(tested,13);assert.equal(protectedEntrance,1);
});
test('input/output directions, sealed wall cells, and research locks are enforced',()=>{
 const g=arena(),out=g.corePorts.find(p=>p.corePort==='outputs'),belt=connect(g,out,(out.side+2)%4);
 assert(g.setProductionOption(out.id,'item_iron_ore'));assert.equal(out.source,'');
 assert.equal(g.setProductionOption(out.id,raw),'');tick(g,4);assert.equal(belt.cargo,null);assert.equal(out.cargo.kind,raw);
 const input=g.corePorts.find(p=>p.corePort==='inputs'),backwards=connect(g,input,input.side);backwards.cargo={kind:finished,age:1};tick(g,2);assert.equal(g.warehouseCount(finished),0);
 const wall=g.deployProduction(1,data.map.core.x-1,data.map.core.y,0).unit;assert(wall);wall.cargo={kind:finished,age:1};tick(g,2);assert.equal(wall.cargo.kind,finished);
 g.researched.push('blue_iron');assert.equal(g.setProductionOption(out.id,'item_iron_ore'),'');
});
test('two outputs cannot duplicate the last finished item; closing returns reserved cargo',()=>{
 const g=arena(),ports=g.corePorts.filter(p=>p.corePort==='outputs').slice(0,2);g.warehouse[finished]=1;
 for(const p of ports)assert.equal(g.setProductionOption(p.id,finished),'');tick(g,3.1);
 assert.equal(g.warehouseCount(finished),0);assert.equal(ports.filter(p=>p.cargo).length,1);
 const held=ports.find(p=>p.cargo);assert.equal(g.setProductionOption(held.id,''),'');assert.equal(g.warehouseCount(finished),1);assert.equal(held.cargo,null);
 // Stop the competing output too, then empty the warehouse: no fabricated stock.
 for(const p of ports)g.setProductionOption(p.id,'');g.warehouse[finished]=0;g.setProductionOption(held.id,finished);tick(g,6);assert.equal(held.cargo,null);
});
test('core output can directly feed a machine and receive its finished output through belts',()=>{
 const g=arena(),out=g.corePorts.find(p=>p.corePort==='outputs'&&p.side===2&&p.y===data.map.core.y+4);
 const refinery=g.deployProduction(2,out.x-3,out.y-1,2).unit;assert(refinery);assert(g.productionPortMatches(out,refinery));
 assert.equal(g.setProductionOption(out.id,raw),'');tick(g,3.1);assert.equal(refinery.cargo.kind,raw);
});
test('core logistics saves restore cargo and progress, migrate old saves, and reject forged ports',()=>{
 const g=new Game(data),p=g.corePorts.find(p=>p.corePort==='outputs');g.setProductionOption(p.id,finished);g.warehouse[finished]=2;tick(g,3.2);
 const doc=session.capture(g,'rules'),restored=session.restore(doc,data,Game,'rules').game;
 assert.deepEqual(restored.corePorts,g.corePorts);const target=new Game(data);session.apply(target,restored);assert.deepEqual(target.corePorts,g.corePorts);
 const legacy=structuredClone(doc);delete legacy.state.corePorts;assert(session.restore(legacy,data,Game,'rules').game.corePorts.every(p=>p.source===''&&!p.cargo));
 for(const mutate of [d=>d.state.corePorts.push(d.state.corePorts[0]),d=>d.state.corePorts[1].id=d.state.corePorts[0].id,d=>d.state.corePorts[0].work=-1,d=>d.state.corePorts[0].source=finished]){const bad=structuredClone(doc);mutate(bad);assert.throws(()=>session.restore(bad,data,Game,'rules'),/核心/);}
 g.reset();assert(g.corePorts.every(p=>p.source===''&&!p.cargo&&p.delivered===0));
});
console.log(JSON.stringify({passed:checks.length,checks},null,2));
