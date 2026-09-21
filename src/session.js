(function(root){
  'use strict';
  const FORMAT='blueprint-defense-save', LAYOUT='blueprint-defense-layout', VERSION=1;
  const fields='phase time dp life wave waveTime spawned intermission kills leaked towers enemies projectiles pendingAttacks effects zones serial spent bossOutcome total reinforcements waveReinforcements enemyHazards production productionEarned productionReceipts warehouse researched researchJob'.split(' ');
  const arrays='towers enemies projectiles pendingAttacks effects zones enemyHazards production productionReceipts researched'.split(' ');
  const fail=message=>{throw Error(message);};
  const check=(ok,message='文件内容不完整或无效')=>{if(!ok)fail(message);};
  function clean(value){
    return JSON.parse(JSON.stringify(value,(key,v)=>{
      if(['image','faces','upgrades','reference'].includes(key))return undefined;
      if(v===-Infinity)return {$number:'-Infinity'};
      return v;
    }));
  }
  function inspect(value,depth=0,budget={n:0}){
    check(depth<40&&++budget.n<300000,'文件内容过大');
    if(typeof value==='number')check(Number.isFinite(value),'文件包含无效数字');
    if(value&&typeof value==='object')for(const [key,v] of Object.entries(value)){
      check(!['__proto__','prototype','constructor'].includes(key),'文件包含无效字段');inspect(v,depth+1,budget);
    }
  }
  function revive(value){
    if(!value||typeof value!=='object')return value;
    if(value.$number==='-Infinity'&&Object.keys(value).length===1)return -Infinity;
    for(const key of Object.keys(value))value[key]=revive(value[key]);
    return value;
  }
  function parse(value,format){
    if(typeof value==='string'){check(value.length<=10*1024*1024,'文件超过 10 MB');value=JSON.parse(value);}
    inspect(value);check(value?.format===format,'这不是对应的蓝图防线文件');check(value.version===VERSION,'文件版本不兼容');return value;
  }
  function scenarioConfig(data,scenario){
    check(['campaign','boss'].includes(scenario),'未知演练模式');
    return scenario==='boss'?{...data,practiceResources:true,waves:data.bossPractice.waves,rules:{...data.rules,initialDP:data.bossPractice.initialDP,maxDP:data.bossPractice.maxDP}}:data;
  }
  function capture(game,rulesId,view={}){
    const state={};for(const key of fields)state[key]=game[key];
    state.corePorts=(game.corePorts||[]).map(({id,source,cargo,work,delivered})=>({id,source,cargo,work,delivered}));
    const owners=new Map(game.towers.map(t=>[t.id,t]));
    for(const name of ['projectiles','pendingAttacks','zones']){
      state[name]=game[name].map(value=>{owners.set(value.owner.id,value.owner);return {...value,owner:value.owner.id};});
    }
    return clean({format:FORMAT,version:VERSION,rulesId,scenario:game.config.practiceResources?'boss':'campaign',savedAt:Date.now(),state,owners:[...owners.values()],boss:game.boss,view});
  }
  function restore(document,data,Game,rulesId,{paused=true}={}){
    document=parse(document,FORMAT);check(document.rulesId===rulesId,'此存档来自其他规则版本，请使用对应版本读取');
    check(Number.isSafeInteger(document.savedAt)&&document.savedAt>=0,'存档时间无效');
    const doc=revive(JSON.parse(JSON.stringify(document))),state=doc.state;
    check(state&&fields.every(k=>Object.hasOwn(state,k)),'存档缺少本局数据');
    const game=new Game(scenarioConfig(data,doc.scenario));
    for(const key of arrays)check(Array.isArray(state[key])&&state[key].length<=12000,'存档设备或事件数量异常');
    for(const key of ['time','dp','life','wave','waveTime','spawned','intermission','kills','leaked','serial','spent','total','reinforcements','waveReinforcements','productionEarned'])check(Number.isFinite(state[key]),'存档数值无效');
    check(['ready','running','paused','won','lost'].includes(state.phase));
    check(state.time>=0&&state.dp>=0&&state.life>=0&&state.life<=game.config.rules.life);
    for(const key of ['waveTime','spawned','intermission','kills','leaked','total','reinforcements','waveReinforcements','productionEarned'])check(state[key]>=0);
    check(Number.isInteger(state.wave)&&state.wave>=-1&&state.wave<game.config.waves.length);
    check(state.serial>=0&&Number.isSafeInteger(state.serial));
    check(state.researched.every(id=>game.config.economy.nodes.some(n=>n.id===id))&&new Set(state.researched).size===state.researched.length,'存档包含未知科技');
    if(state.researchJob)check(game.researchNode(state.researchJob.id)&&Number.isFinite(state.researchJob.remaining)&&state.researchJob.remaining>=0,'研究数据无效');
    const stock=items=>{check(items&&typeof items==='object'&&!Array.isArray(items));for(const [id,n] of Object.entries(items))check(game.config.production.items[id]&&Number.isFinite(n)&&n>=0,'库存数据无效');};
    stock(state.warehouse);
    const ids=new Set(),validateId=o=>{check(o&&Number.isSafeInteger(o.id)&&o.id>0&&o.id<=state.serial&&!ids.has(o.id),'设备编号无效');ids.add(o.id);};
    const validateTower=t=>{
      check(t&&Number.isSafeInteger(t.id)&&t.id>0&&t.id<=state.serial,'攻击来源编号无效');
      check(t&&Number.isInteger(t.type)&&game.config.towers[t.type],'存档包含未知防御塔');
      check(Number.isInteger(t.level)&&t.level>=1&&t.level<=game.maxLevel(t),'防御塔等级无效');
      for(const key of ['x','y','cooldown','spent','kills','shots','animationStart','disabledUntil'])check(Number.isFinite(t[key]),'防御塔数据不完整');
      check(Number.isInteger(t.x)&&Number.isInteger(t.y));
      check(Number.isFinite(t.lastShotAt)||t.lastShotAt===-Infinity);
    };
    for(const t of state.towers){validateId(t);validateTower(t);}
    for(const p of state.production){
      validateId(p);const d=game.config.production.types[p.type];check(Number.isInteger(p.type)&&d&&!d.builtIn,'存档包含未知机械');
      check(Number.isInteger(p.x)&&Number.isInteger(p.y)&&Number.isInteger(p.dir)&&p.dir>=0&&p.dir<4);
      check(Number.isFinite(p.work)&&p.work>=0&&Number.isFinite(p.outputRemaining)&&p.outputRemaining>=0);
      if(d.kind==='processor')check(game.config.production.recipes.some(r=>r.id===p.recipe&&r.machineId===d.id),'生产配方无效');
      if(d.kind==='unloader')check(d.sources.includes(p.source),'取货物品无效');
      if(d.kind==='supply')check(['dp','warehouse','balanced'].includes(p.deliveryMode));
      stock(p.buffer||{});if(p.processingIngredients)stock(p.processingIngredients);
      if(p.cargo)check(game.config.production.items[p.cargo.kind]&&Number.isFinite(p.cargo.age),'机内物料无效');
    }
    for(const e of state.enemies){validateId(e);check(Number.isInteger(e.type)&&game.config.enemies[e.type],'敌人数据无效');for(const k of ['x','y','hp','maxHp','progress'])check(Number.isFinite(e[k]));}
    const originalPhase=state.phase;for(const key of fields)game[key]=state[key];
    // Older v0.18 saves have no core logistics. Derive immutable port geometry
    // from the map and restore only the validated per-port inventory/settings.
    if(state.corePorts!==undefined){
      check(Array.isArray(state.corePorts)&&state.corePorts.length===game.corePorts.length,'核心接口数据无效');
      const seen=new Set();
      for(const saved of state.corePorts){
        const port=game.corePorts.find(p=>p.id===saved.id);
        check(port&&!seen.has(saved.id),'核心接口编号无效');seen.add(saved.id);
        check(typeof saved.source==='string'&&(saved.source===''||port.corePort==='outputs'&&game.config.production.types[port.type].sources.includes(saved.source)),'核心取货物品无效');
        check(Number.isFinite(saved.work)&&saved.work>=0&&Number.isSafeInteger(saved.delivered)&&saved.delivered>=0,'核心输送进度无效');
        if(saved.cargo)check(game.config.production.items[saved.cargo.kind]&&Number.isFinite(saved.cargo.age)&&saved.cargo.age>=0&&(port.corePort==='inputs'||saved.cargo.kind===saved.source),'核心物料无效');
        for(const key of ['source','cargo','work','delivered'])port[key]=saved[key];
      }
    }
    check(game.dp<=game.dpCapacity()+1e-6,'折金票超出仓储容量');
    game.phase='paused';
    for(const t of game.towers)check(!game.footprintError(game.stats(t),t.x,t.y,t.id),'存档建筑占地冲突');
    for(const p of game.production)check(!game.productionPlacementError(p.type,p.x,p.y,p.dir,p.id),'存档机械占地冲突');
    check(Array.isArray(doc.owners)&&doc.owners.length<=12000);
    const owners=new Map(game.towers.map(t=>[t.id,t]));
    for(const t of doc.owners){validateTower(t);if(!owners.has(t.id))owners.set(t.id,t);}
    for(const name of ['projectiles','pendingAttacks','zones'])for(const event of game[name]){
      check(owners.has(event.owner),'存档中的攻击来源已损坏');event.owner=owners.get(event.owner);
      const numeric=name==='projectiles'?['x','y','tx','ty','remaining','total']:name==='pendingAttacks'?['delay']:['x','y','ttl','total','tick','damage','radius'];
      for(const key of numeric)check(Number.isFinite(event[key]),'攻击计时数据无效');
      if(name!=='zones'){
        check(event.stats&&['single','splash','slow','pierce','chain','snipe','acid','flame','mortar'].includes(event.stats.mode),'攻击方式无效');
        for(const key of ['damage','range','interval'])check(Number.isFinite(event.stats[key])&&event.stats[key]>=0,'攻击数据无效');
      }
    }
    game.boss=doc.boss?(game.enemies.find(e=>e.id===doc.boss.id)||doc.boss):null;
    game.audioEvents=[];
    game.phase=paused&&originalPhase==='running'?'paused':originalPhase;
    return {game,view:doc.view||{},document};
  }
  function apply(target,source){
    target.config=source.config;
    for(const key of [...fields,'boss','warehouseLine','corePorts'])target[key]=source[key];
    target.audioEvents=[];
  }
  function layout(game,selectedIds){
    const selected=selectedIds?new Set(selectedIds):null;
    const entries=[...game.towers.filter(t=>!selected||selected.has(t.id)).map(t=>({kind:'tower',id:game.config.towers[t.type].id,x:t.x,y:t.y,level:t.level})),
      ...game.production.filter(p=>!selected||selected.has(p.id)).map(p=>({kind:'production',id:game.config.production.types[p.type].id,x:p.x,y:p.y,dir:p.dir,option:{unloader:p.source,processor:p.recipe,supply:p.deliveryMode}[game.config.production.types[p.type].kind]}))];
    check(entries.length,'没有可导出的设备');
    const x=Math.min(...entries.map(e=>e.x)),y=Math.min(...entries.map(e=>e.y));
    return {format:LAYOUT,version:VERSION,name:'蓝图布局',origin:{x,y},entries:entries.map(e=>({...e,x:e.x-x,y:e.y-y}))};
  }
  function planLayout(game,document,x,y,Game,rulesId){
    document=parse(document,LAYOUT);check(Array.isArray(document.entries)&&document.entries.length>0&&document.entries.length<=game.config.map.width*game.config.map.height,'蓝图设备数量无效');
    check(Number.isInteger(x)&&Number.isInteger(y),'放置起点必须是整数格坐标');
    check(['ready','paused'].includes(game.phase),'请先暂停演练再放置蓝图');
    const candidate=restore(capture(game,rulesId),game.config,Game,rulesId).game;
    for(const [i,e] of document.entries.entries()){
      check(Number.isInteger(e.x)&&Number.isInteger(e.y)&&e.x>=0&&e.y>=0,'蓝图坐标无效');
      let error='',unit;
      if(e.kind==='tower'){
        const type=game.config.towers.findIndex(t=>t.id===e.id);check(type>=0,'蓝图包含未知防御塔');
        check(Number.isInteger(e.level)&&e.level>=1&&e.level<=candidate.maxLevel({type}),'蓝图等级无效');
        const result=candidate.deploy(type,x+e.x,y+e.y);error=result.error;unit=result.tower;
        if(unit)for(let level=1;level<e.level;level++){error=candidate.upgradeError(unit);if(error)break;candidate.upgrade(unit.id);}
      }else{
        check(e.kind==='production','蓝图设备种类无效');const type=game.config.production.types.findIndex(t=>t.id===e.id);check(type>=0,'蓝图包含未知机械');
        const result=candidate.deployProduction(type,x+e.x,y+e.y,e.dir);error=result.error;unit=result.unit;
        if(unit&&e.option!==undefined)error=candidate.setProductionOption(unit.id,e.option);
      }
      check(!error,`第 ${i+1} 台设备：${error}`);
    }
    return {game:candidate,count:document.entries.length,cost:game.dp-candidate.dp,materials:Object.fromEntries(Object.entries(game.warehouse).map(([id,n])=>[id,n-(candidate.warehouse[id]||0)]).filter(([,n])=>n>0))};
  }
  const api={capture,restore,apply,layout,planLayout,parse,scenarioConfig,FORMAT,LAYOUT};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.BlueprintSession=api;
})(globalThis);
