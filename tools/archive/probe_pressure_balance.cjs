const fs=require('node:fs'),{Game}=require('../src/engine.js'),data=require('../src/data.json'),{line,ironPlan,campaignPlan}=require('../tests/geometry_helpers.cjs');
const plans={
 electro:[[0,17,5],[4,18,8],[2,18,12],[4,17,10],[8,24,10],[8,22,19],[5,27,18],[4,22,13]],
 mortars:[[0,17,5],[4,17,8],[2,18,12],[4,21,13],[8,24,10],[8,22,19],[8,27,19],[5,28,12]],
 frost:[[0,17,5],[4,17,8],[2,18,12],[4,21,13],[8,24,10],[8,22,19],[8,27,19],[2,27,14]],
 rear:[[0,17,5],[4,18,8],[2,18,12],[4,22,13],[8,24,10],[8,22,19],[5,31,14],[8,32,19]],
 fourmortar:[[0,17,5],[4,17,8],[2,18,12],[4,21,13],[8,24,10],[8,22,19],[8,27,19],[8,31,19]]};
function run(plan,hp=data.waves.map(w=>w.hp),iron=false,skip=false){const config={...data,waves:data.waves.map((w,i)=>({...w,hp:hp[i]}))},g=new Game(config);line(g);let n=0,peak=0,ironBuilt=false,leaks=[],lastLeaked=0;g.start();for(let i=0;i<40000&&g.phase==='running';i++){
 if(iron&&!ironBuilt&&g.kills>=50&&g.dp>=18){line(g,ironPlan);ironBuilt=true;}
 while(n<plan.length&&g.dp>=data.towers[plan[n][0]].cost){const r=g.deploy(...plan[n++]);if(r.error)throw Error(r.error);}
 if(n===plan.length)for(const t of g.towers)if(!data.towers[t.type].upgrades[t.level-1]?.easterEgg&&t.level<g.maxLevel(t)&&g.dp>=g.upgradeCost(t))g.upgrade(t.id);
 if(skip&&g.intermission>0)g.nextWave();g.step(.05);peak=Math.max(peak,g.enemies.length);if(g.leaked!==lastLeaked){leaks.push({wave:g.wave+1,time:Math.round(g.time),life:g.life});lastLeaked=g.leaked;}}
 return {phase:g.phase,wave:g.wave+1,life:g.life,kills:g.kills,total:g.total,time:Math.round(g.time),leaked:g.leaked,peak,leaks,ironBuilt};}
const results=[];for(const [profile,hp] of Object.entries({moderate:[1.05,1.12,1.25,1.4,1.6,1.75,1.85,2,2.2,2.6],light:[1.05,1.1,1.22,1.35,1.55,1.68,1.75,1.9,2,2.4]}))for(const [name,plan] of Object.entries(plans)){try{const result=run(plan,hp,true);console.log(profile,name,result.phase,'wave',result.wave,'life',result.life,'kills',result.kills,'peak',result.peak);results.push({profile,name,...result});}catch(e){console.log(name,e.message);}}
fs.writeFileSync('F:/4/endfield_blueprint_td/reports/pressure_candidates.json',JSON.stringify(results,null,2));module.exports={run,plans};
