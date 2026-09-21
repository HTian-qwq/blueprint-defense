// Historical v13 balance regression. New industrial recipes are tested in industrial suites.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('./fixtures/v13_balance.json'),{makePlanner}=require('./economy_campaign.cjs');
const g=new Game(data),p=makePlanner(),checks=[];
for(let i=0;i<4;i++)p.tick(g);g.start();let peak=0,wait=0,preps=0,wasPrep=false;
for(let i=0;i<40000&&g.phase==='running';i++){
 p.tick(g);g.step(.05);peak=Math.max(peak,g.enemies.length);wait+=g.towers.filter(t=>t.awaitingSupply&&g.ammunitionError(t)).length*.05;
 if(g.isPreparing()&&!wasPrep)preps++;wasPrep=g.isPreparing();assert(g.dp>=-1e-8&&g.dp<=g.dpCapacity()+1e-8);for(const count of Object.values(g.warehouse))assert(Number.isInteger(count)&&count>=0);
}
assert.equal(g.phase,'won');assert(g.life>0);assert.equal(g.kills+g.leaked,g.total);assert.equal(g.bossOutcome,'defeated');assert(g.towers.length>8);assert.equal(preps,9);assert.equal(p.step,p.length);
checks.push('a 40-DP run wins all ten waves and Rodin using public actions, original production, researched ordinary towers and actual ammunition');
assert.equal(g.researched.length,8);assert.equal(g.researchJob,null);assert(wait>0);assert(peak>100);assert(g.towers.every(t=>!g.stats(t).easterEgg));
checks.push('all eight technologies complete; stock never becomes negative, more than 100 enemies coexist, supply shortages occur and the W refit is unnecessary');
const result={fixture:'v13_balance.json',passed:checks.length,checks,phase:g.phase,life:g.life,kills:g.kills,leaked:g.leaked,total:g.total,towers:g.towers.length,production:g.production.length,researched:g.researched,time:+g.time.toFixed(2),peak,supplyWait:+wait.toFixed(2),journal:p.journal};
fs.writeFileSync(path.join(__dirname,'../reports/legacy_v13_campaign_checks.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,journal:undefined},null,2));
