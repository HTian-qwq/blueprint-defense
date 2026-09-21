// A deterministic player using only public build/research/configuration actions.
// No resource grants, kill edits, shortened waves, or simulated free production.
function makePlanner(){
  let step=0;const journal=[];
  const tower=(type,x,y)=>(g)=>{const r=g.deploy(type,x,y);return !!r.tower;};
  const line=(x,recipe,mode='balanced',component=false)=>g=>{
    const cfg=g.config.production,output=cfg.recipes.find(r=>r.id===recipe),cost=component?18:11;
    if(g.dp<cost||g.productionRecipeLock(output))return false;
    const plan=[[0,x,27,3,output.input],[2,x,24,3,recipe],...(component?[[5,x,21,3]]:[]),[3,x,component?18:21,3,mode]];
    if(recipe.startsWith('grinder'))plan[1][0]=4;
    for(const [type,xx,y,dir] of plan)if(g.productionPlacementError(type,xx,y,dir))throw Error('planner position '+[type,xx,y]+' '+g.productionPlacementError(type,xx,y,dir));
    for(const [type,xx,y,dir,option] of plan){const r=g.deployProduction(type,xx,y,dir);if(!r.unit)throw Error(r.error);if(option){const error=g.setProductionOption(r.unit.id,option);if(error)throw Error(error);}}
    return true;
  };
  const research=id=>g=>g.researched.includes(id)||g.researchJob?.id===id||!!g.startResearch(id).job;
  const refit=(x,y,level)=>g=>{const t=g.towerAt(x,y);return t.level>=level||g.upgrade(t.id);};
  const sequence=[
    line(1,'furnance_crystal_shell_1','dp'),tower(0,6,5),tower(0,9,7),tower(0,17,5),
    line(5,'furnance_crystal_shell_1'),tower(2,18,12),tower(0,18,8),
    research('ballistics'),refit(17,5,2),research('logistics'),
    line(9,'furnance_quartz_glass_1'),tower(0,21,13),tower(0,22,10),
    line(13,'grinder_originium_powder_1','warehouse'),
    line(17,'furnance_iron_nugget_1','warehouse',true),
    line(21,'furnance_iron_nugget_1','balanced'),research('electromagnetics'),
    tower(4,15,7),research('heavy'),tower(8,23,6),
    line(25,'furnance_iron_nugget_1','balanced',true),
    research('storm'),refit(17,5,3),refit(18,8,2),
    research('chemistry'),line(29,'furnance_iron_nugget_1','warehouse',true),
    research('overcharge'),tower(3,30,13),
    tower(5,31,10),tower(8,27,10),tower(0,24,13),refit(15,7,2),
    research('precision'),refit(31,10,2),refit(30,13,2),refit(18,12,2),
    line(33,'furnance_quartz_glass_1','warehouse'),line(37,'furnance_crystal_shell_1','warehouse'),
    refit(24,13,2),refit(21,13,2),refit(22,10,2),
    refit(31,10,3),refit(18,12,3),tower(8,30,4)
  ];
  return {journal,get step(){return step;},get length(){return sequence.length;},tick(g){
    if(step<sequence.length&&sequence[step](g)){journal.push({step:step++,time:+g.time.toFixed(2),wave:g.wave+1,dp:Math.floor(g.dp),kills:g.kills,towers:g.towers.length,tech:[...g.researched]});}
  }};
}
module.exports={makePlanner};
if(require.main===module){
 const fs=require('node:fs'),path=require('node:path'),{Game}=require('../src/engine.js'),data=require('../src/data.json');
 const g=new Game(data),planner=makePlanner();for(let i=0;i<4;i++)planner.tick(g);g.start();let peak=0,supplyWait=0;
 for(let i=0;i<40000&&g.phase==='running';i++){planner.tick(g);g.step(.05);peak=Math.max(peak,g.enemies.length);supplyWait+=g.towers.filter(t=>t.awaitingSupply&&g.ammunitionError(t)).length*.05;}
 const result={phase:g.phase,wave:g.wave+1,life:g.life,kills:g.kills,total:g.total,time:g.time,peak,towers:g.towers.length,dp:g.dp,researched:g.researched,stock:g.warehouse,productionEarned:g.productionEarned,supplyWait,completedSteps:planner.step,steps:planner.length,journal:planner.journal};
 fs.writeFileSync(path.join(__dirname,'../reports/economy_campaign.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,journal:undefined},null,2));
}
