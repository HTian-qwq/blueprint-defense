const assert=require('node:assert/strict');
const productionOffset=require('../src/data.json').map.height-32;
const dockPlan=plan=>plan.map(([type,x,y,...rest])=>[type,x,y+productionOffset,...rest]);
const starterPlan=dockPlan([[0,1,27,3],[1,2,26,3],[2,1,23,3],[1,2,22,3],[3,1,19,3]]);
const ironPlan=dockPlan([[0,5,27,3,'item_iron_ore'],[2,5,24,3,'furnance_iron_nugget_1'],[5,5,21,3],[3,5,18,3]]);
function line(g,plan){plan??=starterPlan.map(([type,x,y,...rest])=>[type,x,y+g.config.map.height-32-productionOffset,...rest]);for(const [type,x,y,dir,option] of plan){const result=g.deployProduction(type,x,y,dir);assert(result.unit,result.error);if(option)assert.equal(g.setProductionOption(result.unit.id,option),'');}}
function tick(g,seconds){for(let n=0;n<Math.round(seconds/.05);n++){g.time+=.05;g.updateProduction(.05);}}
const campaignPlan=[[0,17,5],[4,18,8],[2,18,12],[4,22,13],[8,24,10],[8,22,19],[5,31,14],[8,32,19]];
module.exports={starterPlan,ironPlan,line,tick,campaignPlan,productionOffset,dockPlan};
