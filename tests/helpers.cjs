const assert=require('node:assert/strict');
function starterLine(g){for(const [type,y] of [[0,10],[1,9],[2,8],[1,7],[3,6]])assert(g.deployProduction(type,1,y,3).unit);}
// Tiny footprints isolate projectile/ability arithmetic in legacy combat fixtures.
// Real placement, browser interactions and campaign tests use the original sizes.
function unitCombatData(data){return {...data,map:{width:20,height:12,corners:[[0,5],[4,5],[4,2],[10,2],[10,8],[16,8],[16,5],[19,5]]},towers:data.towers.map(t=>({...t,footprint:{width:1,depth:1},upgrades:t.upgrades.map(u=>({...u,footprint:{width:1,depth:1}}))}))};}
const campaignPlan=[[0,5,3],[2,7,3],[1,7,6],[4,11,6],[5,7,0],[6,5,6],[8,12,2],[3,14,0]];
module.exports={starterLine,unitCombatData,campaignPlan};
