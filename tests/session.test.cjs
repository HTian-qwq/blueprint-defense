const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Game}=require('../src/engine.js'),data=require('../src/data.json'),api=require('../src/session.js');
const checks=[];function test(name,fn){fn();checks.push(name);}const rules='test-rules';
const capture=g=>api.capture(g,rules),restore=d=>api.restore(d,data,Game,rules).game;
test('an untouched game and unfired towers round-trip, including negative infinity and paused restoration',()=>{
 const g=new Game(data);assert(g.deploy(0,12,22).tower);const saved=capture(g),copy=restore(JSON.stringify(saved));assert.equal(copy.towers[0].lastShotAt,-Infinity);assert.deepEqual(capture(copy).state,saved.state);
 g.start();assert.equal(restore(capture(g)).phase,'paused');assert.equal(g.phase,'running');
});
test('in-flight attacks and pending volleys reconnect to the same tower objects and preserve future combat',()=>{
 const g=new Game(data),t=g.deploy(0,12,22).tower,e=g.spawn(0,20);g.start();g.launchShot(t,g.stats(t),e);g.pendingAttacks.push({owner:t,stats:g.stats(t),targetId:e.id,action:'sound',delay:.1});
 const saved=capture(g);assert(!JSON.stringify(saved).includes('data:image'));const copy=restore(saved);assert.equal(copy.projectiles[0].owner,copy.towers[0]);assert.equal(copy.pendingAttacks[0].owner,copy.towers[0]);
 copy.togglePause();g.advance(.5);copy.advance(.5);assert.deepEqual(capture(copy).state,capture(g).state);
});
test('a withdrawn owner and a detached boss remain available to in-flight damage and the boss panel',()=>{
 const g=new Game(data),t=g.deploy(0,12,22).tower,e=g.spawn(12);g.launchShot(t,g.stats(t),e);g.withdraw(t.id);g.enemies=[];
 const copy=restore(capture(g));assert.equal(copy.towers.length,0);assert.equal(copy.projectiles[0].owner.id,t.id);assert.equal(copy.boss.id,e.id);assert(copy.boss!==e);
});
test('production buffers, partial output, research payment, ammunition and practice isolation survive a save',()=>{
 const g=new Game(data);g.warehouse.item_crystal_shell=8;g.warehouse.item_quartz_glass=6;assert(!g.startResearch('blue_iron').error);
 const p=g.deployProduction(2,1,39,3).unit;assert(p);p.cargo={kind:'item_originium_ore',age:.25};p.work=.4;
 const copy=restore(capture(g));assert.deepEqual(capture(copy).state,capture(g).state);assert.equal(copy.config.practiceResources,undefined);
 const practice=new Game(api.scenarioConfig(data,'boss')),round=restore(capture(practice));assert.equal(round.config.practiceResources,true);assert.equal(round.config.waves.length,2);assert.equal(round.dp,500);
});
test('malformed, incompatible and colliding saves are rejected without touching the original state',()=>{
 const g=new Game(data);g.deploy(0,12,22);const doc=capture(g),before=capture(g).state;
 const bad=structuredClone(doc);bad.state.towers.push({...bad.state.towers[0],id:++bad.state.serial});assert.throws(()=>restore(bad),/占地冲突/);
 assert.throws(()=>restore({...doc,rulesId:'other'}),/规则版本/);assert.throws(()=>restore({...doc,version:100}),/版本/);
 assert.throws(()=>restore(''+JSON.stringify(doc).replace('"state":{','"state":{"__proto__":{},')),/无效字段/);
 assert.deepEqual(capture(g).state,before);
});
test('layout export stores only chosen building definitions and configuration, with no stock or progress',()=>{
 const g=new Game(data),p=g.deployProduction(0,1,43,3).unit,t=g.deploy(0,12,22).tower;assert(p&&t);
 const doc=api.layout(g,[p.id]);assert.equal(doc.entries.length,1);assert.equal(doc.entries[0].id,'unloader_1');assert.equal(doc.entries[0].option,'item_originium_ore');assert.equal(doc.entries[0].dir,3);assert.equal(doc.entries[0].x,0);assert(!('warehouse' in doc));assert(!JSON.stringify(doc).includes('cargo'));
});
test('layout placement is atomic, obeys collision, research and payment rules, and never imports materials',()=>{
 const source=new Game(data);source.deploy(0,12,22);const doc=api.layout(source),g=new Game(data),before=capture(g).state;
 const plan=api.planLayout(g,doc,12,22,Game,rules);assert.equal(plan.cost,9);assert.equal(plan.game.towers.length,1);assert.deepEqual(capture(g).state,before);
 api.apply(g,plan.game);assert.equal(g.dp,31);const after=capture(g).state;assert.throws(()=>api.planLayout(g,doc,12,22,Game,rules),/重叠/);assert.deepEqual(capture(g).state,after);
 const duplicate=structuredClone(doc);duplicate.entries.push({...duplicate.entries[0]});assert.throws(()=>api.planLayout(new Game(data),duplicate,12,22,Game,rules),/重叠/);
 const locked=structuredClone(doc);locked.entries[0].level=2;assert.throws(()=>api.planLayout(new Game(data),locked,12,22,Game,rules),/研究/);
 const poor=new Game(data);poor.dp=0;assert.throws(()=>api.planLayout(poor,doc,12,22,Game,rules),/费用不足/);assert.equal(poor.towers.length,0);assert.equal(poor.dp,0);
});
const result={passed:checks.length,checks};fs.writeFileSync(path.join(__dirname,'../reports/session_checks.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
