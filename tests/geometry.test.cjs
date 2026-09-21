const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),reference=require('../sources/building_geometry_reference.json');
const {line,tick,starterPlan,ironPlan,campaignPlan}=require('./geometry_helpers.cjs');
const checks=[];function test(name,fn){fn();checks.push(name);}function arena(){const g=new Game({...data,economy:null});g.dp=99;g.researched=data.economy.nodes.map(n=>n.id);return g;}
function put(g,type,x,y,dir=0){const r=g.deployProduction(type,x,y,dir);assert(r.unit,r.error);return r.unit;}
const vectors=[[1,0],[0,1],[-1,0],[0,-1]];
test('expanded map and every original tower, production building, warehouse segment and core use source dimensions',()=>{
 assert.equal(data.map.width,64);assert.equal(data.map.height,48);assert.deepEqual(data.map.core.footprint,{width:9,depth:9});
 for(const d of data.production.types){if(d.kind==='belt')continue;const original=reference.buildings[d.id].originalRange;assert.deepEqual(d.footprint,{width:original.depth,depth:original.width});}
 for(const d of data.towers){const original=reference.buildings[d.id].originalRange;assert.deepEqual(d.footprint,{width:original.width,depth:original.depth});}
});
test('nine full-size fixed warehouse sections cover all 64 by 4 bottom cells with an online shared network',()=>{
 const g=arena(),online=g.warehouseConnections();assert.equal(g.warehouseLine.length,9);assert.equal(online.size,9);
 for(let y=44;y<48;y++)for(let x=0;x<64;x++)assert(g.productionAt(x,y)?.fixed);
 assert.equal(g.productionAt(43,27),undefined);for(const p of g.warehouseLine){assert.equal(g.removeProduction(p.id),0);assert.equal(g.rotateProduction(p.id),false);}
});
test('full production footprints block roads, core, map edges, warehouse, towers and other production without charging',()=>{
 const g=arena(),before=g.dp;for(const [t,x,y,d] of [[2,19,6,0],[2,31,5,0],[0,63,20,3],[2,2,43,3]])assert(g.deployProduction(t,x,y,d).error);
 assert(g.deployProduction(999,0,0).error);assert.equal(g.dp,before);const p=put(g,2,12,20,3);
 for(let x=12;x<15;x++)for(let y=20;y<23;y++){assert.equal(g.productionAt(x,y),p);assert(g.deployProduction(1,x,y).error);assert(g.deploy(0,x,y).error);}
 g.removeProduction(p.id);assert(g.deploy(0,12,20).tower);assert(g.deployProduction(2,13,21,3).error);
});
test('3 by 1 ports rotate to 1 by 3; a collision rejects rotation atomically and preserves cargo',()=>{
 const g=arena(),p=put(g,0,12,20,3);assert.deepEqual(g.productionRect(p),{x:12,y:20,width:3,depth:1});p.cargo={kind:'item_crystal_shell',age:2};const blocker=put(g,1,12,22,0),before=JSON.stringify(p);
 assert.equal(g.rotateProduction(p.id),false);assert.equal(JSON.stringify(p),before);g.removeProduction(blocker.id);assert(g.rotateProduction(p.id));assert.deepEqual(g.productionRect(p),{x:12,y:20,width:1,depth:3});assert.equal(p.cargo.kind,'item_crystal_shell');
});
test('all original solid ports match original coordinates independently through every clockwise rotation',()=>{
 const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'../sources/game_data/tables/FactoryBuildingTable.json'),'utf8')),g=arena();
 for(let type=0;type<data.production.types.length;type++){const d=data.production.types[type],b=raw[d.id];if(!d.portCells)continue;
 for(let dir=0;dir<4;dir++)for(const [kind,field] of [['inputs','inputPorts'],['outputs','outputPorts']]){
 const expected=(d.kind==='supply'&&kind==='outputs'?[]:b[field].filter(p=>!p.isPipe)).map(p=>{let x=p.trans.position.x,y=b.range.depth-1-p.trans.position.z,w=b.range.width,h=b.range.depth,side=(p.trans.rotation.y/90+(kind==='inputs'?2:0)+3)%4;
 for(let n=0;n<(dir+3)%4;n++){[x,y]=[h-1-y,x];[w,h]=[h,w];side=(side+1)%4;}return {x:12+x,y:20+y,side,index:p.index};});assert.deepEqual(g.productionPortCells({type,x:12,y:20,dir},kind),expected,d.id+' '+dir+' '+kind);
 }}
});
let intakeCases=0;
test('each visible input on all four rotations receives through its own adjacent cell',()=>{
 for(const type of [2,3,4,5,8])for(let dir=0;dir<4;dir++){
  const sample=arena(),ports=sample.productionPortCells({type,x:12,y:20,dir},'inputs');
  for(const port of ports){const g=arena(),p=put(g,type,12,20,dir),[dx,dy]=vectors[port.side],feed=put(g,1,port.x+dx,port.y+dy,(port.side+2)%4);const kind=type===3?'item_crystal_shell':g.productionRecipe(p)?.input||'item_originium_ore';feed.cargo={kind,age:1};tick(g,.05);assert.equal(p.cargo?.kind,kind);assert.equal(feed.cargo,null);intakeCases++;}
 }
 assert.equal(intakeCases,52);
});
test('a port offset or facing mismatch cannot feed through a plain wall',()=>{
 const g=arena(),p=put(g,8,12,20,1);assert.deepEqual(g.productionRect(p),{x:12,y:20,width:3,depth:1});
 for(const x of [12,14]){const feed=put(g,1,x,19,1);feed.cargo={kind:'item_crystal_shell',age:1};assert(!g.productionPortMatches(feed,p));}
 tick(g,1);assert.equal(p.cargo,null);assert.equal(g.production.filter(p=>p.cargo).length,2);
});
test('multiple outputs choose an available connected port and one input never clones a product',()=>{
 const g=arena(),p=put(g,2,12,20,3),a=put(g,1,12,19,3),b=put(g,1,14,19,3);a.cargo={kind:'item_crystal_shell',age:0};p.cargo={kind:'item_crystal_shell',age:0};tick(g,.05);assert.equal(p.cargo,null);assert.equal(b.cargo.kind,'item_crystal_shell');assert.equal(a.cargo.kind,'item_crystal_shell');
 const h=arena(),r=put(h,2,12,20,3);for(const x of [12,14])put(h,1,x,23,3).cargo={kind:'item_originium_ore',age:1};tick(h,.05);assert(r.cargo);assert.equal(h.production.filter(p=>p.cargo).length,2);
});
test('warehouse docking covers the complete rotated rear edge and works across a source-segment seam',()=>{
 const g=arena(),p=put(g,0,2,43,3),offline=put(g,0,12,25,0),deposit=put(g,8,16,43,1);assert(g.warehouseConnections().has(p.id));assert(!g.warehouseConnections().has(offline.id));
 deposit.cargo={kind:'item_crystal_shell',age:0};g.setProductionOption(p.id,'item_crystal_shell');tick(g,4);assert.equal(p.cargo.kind,'item_crystal_shell');assert.equal(g.warehouseCount('item_crystal_shell'),0);assert.equal(offline.cargo,null);assert.equal(deposit.cargo,null);
});
test('a real thirteen-DP full-size starter line generates income and incorrect refinery rotation stops the line',()=>{
 const g=new Game(data);line(g);assert.equal(g.dp,27);g.dp=0;tick(g,20);assert.equal(g.productionEarned,10);
 const h=new Game(data);line(h);h.rotateProduction(h.production.find(p=>p.type===2).id);h.dp=0;tick(h,20);assert.equal(h.productionEarned,0);assert.match(h.productionStatus(h.production.find(p=>p.type===2)),/入口朝向不匹配/);
});
test('blue iron remains locked after kills; researched full-size refining/component chain pays five DP',()=>{
 const g=new Game(data);g.dp=99;g.kills=500;const p=put(g,0,5,43,3);assert(g.setProductionOption(p.id,'item_iron_ore'));g.researched.push('blue_iron');assert.equal(g.setProductionOption(p.id,'item_iron_ore'),'');g.removeProduction(p.id);line(g,ironPlan);g.dp=0;tick(g,20);assert(g.productionEarned>=20);assert.equal(g.productionEarned%5,0);
});
test('changing a recipe returns actual buffered stock once, pause freezes production, and reset clears geometry',()=>{
 const g=arena(),p=put(g,2,12,20,3);p.cargo={kind:'item_iron_nugget',age:0};g.setProductionOption(p.id,'furnance_quartz_glass_1');assert.equal(g.warehouseCount('item_iron_nugget'),1);g.setProductionOption(p.id,'furnance_quartz_glass_1');assert.equal(g.warehouseCount('item_iron_nugget'),1);
 line(g);g.start();g.advance(1);g.togglePause();const before=JSON.stringify(g);g.advance(12);assert.equal(JSON.stringify(g),before);g.reset();assert.equal(g.production.length,0);assert.equal(g.productionAt(12,20),undefined);assert.equal(g.warehouseLine.length,9);assert.equal(g.kills,0);
});
test('the final belt ends at the core south intake; core cells block builds and reaching it deducts life exactly once',()=>{
 const g=arena(),c=data.map.core;assert.deepEqual(g.point(g.track.length),c.entrance);assert.equal(g.path.at(-1).y,c.y+c.footprint.depth);for(let y=c.y;y<c.y+9;y++)for(let x=c.x;x<c.x+9;x++){assert(g.coreAt(x,y));assert(g.deploy(0,x,y).error);assert(g.deployProduction(1,x,y).error);}
 const e=g.spawn(0,1);e.progress=g.track.length-.01;g.start();g.advance(.1);assert.equal(g.life,9);g.advance(.1);assert.equal(g.life,9);
 const h=arena(),boss=h.spawn(12,1);boss.progress=h.track.length-.01;h.start();h.advance(.1);assert.equal(h.life,0);assert.equal(h.phase,'lost');
});
// The current production/research campaign runs in economy_campaign.test.cjs.
const balance={};
const report={passed:checks.length,checks,intakeCases,balance};fs.writeFileSync(path.join(__dirname,'../reports/geometry_checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
