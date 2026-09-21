const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),{tick,line:placeLine,dockPlan}=require('./geometry_helpers.cjs');
const line=(g,plan)=>placeLine(g,dockPlan(plan));
const checks=[];function test(name,fn){fn();checks.push(name);}
const iron='item_iron_powder',sand='item_plant_moss_powder_3',dense='item_iron_enr_powder',steel='item_iron_enr';
function fixture(){return new Game({...data,practiceResources:true,rules:{...data.rules,initialDP:500,maxDP:500}});}
function amount(g,id){return (g.warehouse[id]||0)+g.production.reduce((n,p)=>n+(p.cargo?.kind===id?1:0)+(p.buffer?.[id]||0)+(p.processingIngredients?.[id]||0)+(g.productionRecipe(p)?.output===id?p.outputRemaining||0:0),0);}
function batchLine(g,type,a,b,recipe){line(g,[[0,1,27,3,a],[0,4,27,3,b],[type,1,23,3,recipe],[3,1,20,3,'warehouse']]);}
test('22 original recipes retain every ingredient, output count and game-table duration',()=>{
 const dir=path.join(__dirname,'../sources/game_data/tables'),crafts=JSON.parse(fs.readFileSync(dir+'/FactoryMachineCraftTable.json','utf8')),groups=JSON.parse(fs.readFileSync(dir+'/FactoryMachineCraftGroupTable.json','utf8'));
 assert.equal(data.production.recipes.length,22);assert.equal(data.economy.nodes.length,15);
 for(const r of data.production.recipes){const original=crafts[r.id],inputs=original.ingredients.flatMap(g=>g.group).map(({id,count})=>({id,count})),outputs=original.outcomes.flatMap(g=>g.group);assert.deepEqual(r.inputs,inputs);assert.equal(r.output,outputs[0].id);assert.equal(r.outputCount,outputs[0].count);assert.equal(r.period,original.progressRound*groups[original.formulaGroupId].msPerRound/1000);}
});
test('every technology is reachable from produced materials without a circular unlock',()=>{
 const g=new Game(data);const available=new Set(data.production.rawMaterials.filter(id=>!g.productionItemLock(id)));let changed=true;
 while(changed){changed=false;for(const id of data.production.rawMaterials)if(!g.productionItemLock(id)&&!available.has(id)){available.add(id);changed=true;}
  for(const r of data.production.recipes)if(!g.productionRecipeLock(r)&&r.inputs.every(x=>available.has(x.id))&&!available.has(r.output)){available.add(r.output);changed=true;}
  for(const n of data.economy.nodes)if(!g.researched.includes(n.id)&&n.requires.every(id=>g.researched.includes(id))&&Object.keys(n.materials).every(id=>available.has(id))){g.researched.push(n.id);changed=true;}
 }assert.equal(g.researched.length,data.economy.nodes.length);assert.equal(available.size,Object.keys(data.production.items).length);
});
test('production research locks machine placement, recipes and advanced withdrawals without spending',()=>{
 const g=new Game(data),before=JSON.stringify(g);assert.match(g.deployProduction(9,1,15,3).error,/需要研究/);assert.equal(JSON.stringify(g),before);
 assert.match(g.productionOptionError(4,'grinder_plant_moss_powder_3_1'),/粉体/);assert.match(g.productionOptionError(0,'item_proc_battery_3'),/集成/);
 g.researched.push('powder');assert.equal(g.productionOptionError(4,'grinder_plant_moss_powder_3_1'),'');assert.equal(g.warehouseCount('item_plant_moss_3'),Infinity);assert.match(g.productionOptionError(4,'grinder_iron_powder_1'),/蓝铁冶炼/);
 g.researched.push('blue_iron');assert.equal(g.productionOptionError(4,'grinder_iron_powder_1'),'');g.reset();assert.equal(g.warehouseCount('item_plant_moss_3'),0);
});
test('blue iron ignores kills, unlocks only when paid research completes, freezes on pause and resets',()=>{
 const g=new Game(data);g.kills=500;
 assert.equal(g.warehouseCount('item_iron_ore'),0);assert.match(g.productionOptionError(2,'furnance_iron_nugget_1'),/蓝铁冶炼/);
 const node=g.researchNode('blue_iron');assert.deepEqual(node.materials,{item_crystal_shell:8,item_quartz_glass:6});assert.equal(node.cost,20);assert.equal(node.seconds,25);
 const before=JSON.stringify(g);assert(g.startResearch('blue_iron').error);assert.equal(JSON.stringify(g),before);
 g.kills=0;g.warehouse={...node.materials};assert(g.startResearch('blue_iron').job);assert.equal(g.dp,20);assert.equal(g.warehouse.item_crystal_shell,0);assert.equal(g.warehouse.item_quartz_glass,0);
 g.start();g.advance(24);assert.equal(g.warehouseCount('item_iron_ore'),0);g.togglePause();g.advance(30);assert.equal(g.warehouseCount('item_iron_ore'),0);g.togglePause();g.advance(1);
 assert.equal(g.kills,0);assert.equal(g.warehouseCount('item_iron_ore'),Infinity);assert.equal(g.productionOptionError(5,'component_iron_cmpt_1'),'');assert.equal(g.warehouseCount('item_iron_cmpt'),0);
 g.reset();assert.equal(g.warehouseCount('item_iron_ore'),0);assert.deepEqual(g.researched,[]);
});
test('two warehouse lanes feed the original 6-by-4 grinder and conserve both ingredients through smelting',()=>{
 const g=fixture();g.warehouse={[iron]:20,[sand]:10};
 line(g,[[0,1,27,3,iron],[0,4,27,3,sand],[9,1,23,3,'thickener_iron_enr_powder_1'],[2,1,20,3,'furnance_iron_enr_1'],[3,1,17,3,'warehouse']]);
 assert.deepEqual(g.productionFootprint(9,3),{width:6,depth:4});const grinder=g.production.find(p=>p.type===9);
 assert(g.productionPortMatches(g.production[0],grinder));assert(g.productionPortMatches(g.production[1],grinder));tick(g,65);
 assert(g.warehouseCount(steel)>=8);const outputs=amount(g,dense)+amount(g,steel);assert.equal(amount(g,iron)+outputs*2,20);assert.equal(amount(g,sand)+outputs,10);
});
test('missing second ingredient stalls without consuming the first or leaking it to the output',()=>{
 const g=fixture();g.warehouse={[iron]:4,[sand]:0};batchLine(g,9,iron,sand,'thickener_iron_enr_powder_1');tick(g,20);
 const p=g.production.find(p=>p.type===9);assert.equal(p.buffer[iron],2);assert.equal(g.warehouseCount(dense),0);assert.equal(p.processingIngredients,null);assert.match(g.productionStatus(p),/砂叶粉末 0\/1/);
 g.warehouse[sand]=1;tick(g,8);assert.equal(g.warehouseCount(dense),1);assert.equal(amount(g,iron),2);
});
test('one leaf emits exactly three individual powder items, including queued outputs under blockage',()=>{
 const g=fixture();g.warehouse={};line(g,[[4,1,24,3,'grinder_plant_moss_powder_3_1']]);const p=g.production[0];g.receiveProduction(p,'item_plant_moss_3');tick(g,3);assert.equal(p.cargo.kind,sand);assert.equal(p.outputRemaining,2);assert.equal(amount(g,sand),3);tick(g,10);assert.equal(amount(g,sand),3);
 line(g,[[3,1,21,3,'warehouse']]);tick(g,3);assert.equal(g.warehouseCount(sand),3);assert.equal(p.cargo,null);assert.equal(p.outputRemaining,0);
});
test('battery assembly consumes full 10-plus-15 batches and cannot restart with partial inputs',()=>{
 const g=fixture(),parts='item_iron_enr_cmpt',powder='item_originium_enr_powder',battery='item_proc_battery_3';g.warehouse={[parts]:20,[powder]:30};batchLine(g,10,parts,powder,'tools_proc_battery_3_1');tick(g,108);
 assert.equal(g.warehouseCount(battery),2);assert.equal(amount(g,parts),0);assert.equal(amount(g,powder),0);tick(g,30);assert.equal(g.warehouseCount(battery),2);
});
test('changing a running recipe refunds actual buffered and consumed ingredients, never future products',()=>{
 const g=fixture();g.warehouse={};const p=g.deployProduction(9,1,15,3).unit;p.buffer={[iron]:2,[sand]:1};tick(g,.5);assert(p.processingIngredients);p.buffer={[sand]:1};
 assert.equal(g.setProductionOption(p.id,'thickener_originium_enr_powder_1'),'');assert.equal(g.warehouseCount(iron),2);assert.equal(g.warehouseCount(sand),2);assert.equal(g.warehouseCount(dense),0);assert.equal(p.work,0);assert.equal(p.processingIngredients,null);assert.deepEqual(p.buffer,{});
});
test('queued multi-output stock survives movement and reconfiguration without duplication',()=>{
 const g=fixture();g.warehouse={};const p=g.deployProduction(4,1,15,3).unit;g.setProductionOption(p.id,'grinder_plant_moss_powder_3_1');g.receiveProduction(p,'item_plant_moss_3');tick(g,3);assert(g.moveBuilding(p.id,5,15,0).unit);assert.equal(amount(g,sand),3);g.setProductionOption(p.id,'grinder_originium_powder_1');assert.equal(g.warehouseCount(sand),3);assert.equal(p.outputRemaining,0);
});
test('advanced refits require manufactured steel or high-crystal materials and batteries fit the unlocked wallet',()=>{
 const g=fixture();assert.equal(g.dpCapacity(),500);assert.equal(data.production.items.item_proc_battery_3.value,225);assert.deepEqual(data.towers[0].upgrades[1].materials,{item_iron_enr_cmpt:6});assert.equal(data.towers[8].upgrades[0].materials.item_proc_battery_3,1);
});
const report={passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'../reports/industrial_checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
