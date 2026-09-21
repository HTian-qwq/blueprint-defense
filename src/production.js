(function(root){
  'use strict';
  const directions=[[1,0],[0,1],[-1,0],[0,-1]];
  const api={
    initWarehouseLine(){
      const types=this.config.production?.types||[],hub=types.findIndex(d=>d.kind==='hub'),bus=types.findIndex(d=>d.kind==='bus');
      this.warehouseLine=[];if(hub<0||bus<0)return;
      for(let x=0;x<this.config.map.width;){
        let type=x===0?hub:bus,f=this.productionFootprint(type,0);
        // A source post caps the last four cells without stretching original building art.
        if(x+f.width>this.config.map.width){type=hub;f=this.productionFootprint(type,0);if(x+f.width!==this.config.map.width)break;}
        this.warehouseLine.push({id:'warehouse-'+x,type,x,y:this.config.map.height-f.depth,dir:0,fixed:true,cargo:null,work:0,delivered:0});x+=f.width;
      }
    },
    productionFootprint(type,dir=0){const f=this.footprint(this.config.production.types[type]);return dir%2?{width:f.depth,depth:f.width}:{...f};},
    productionRect(p){return {x:p.x,y:p.y,...this.productionFootprint(p.type,p.dir)};},
    productionCenter(p){const f=this.productionRect(p);return {x:p.x+f.width/2,y:p.y+f.depth/2};},
    productionContains(p,x,y){const f=this.productionRect(p);return x>=p.x&&y>=p.y&&x<p.x+f.width&&y<p.y+f.depth;},
    edgeCells(p,side){const f=this.productionRect(p),n=side%2?f.width:f.depth;return Array.from({length:n},(_,i)=>({x:p.x+(side===0?f.width-1:side===2?0:i),y:p.y+(side===1?f.depth-1:side===3?0:i),side}));},
    productionPortCells(p,kind){
      const d=this.config.production.types[p.type],f=this.footprint(d),cells=d.portCells?.[kind]||d.ports[kind].map(side=>({x:0,y:0,side}));
      return cells.map(port=>{let {x,y,side}=port,w=f.width,h=f.depth;for(let turn=0;turn<p.dir;turn++){[x,y]=[h-1-y,x];[w,h]=[h,w];side=(side+1)%4;}return {...port,x:p.x+x,y:p.y+y,side};});
    },
    isRawMaterial(kind){return this.config.production.rawMaterials.includes(kind);},
    productionResearchLock(id){return !id||this.config.practiceResources||this.researched?.includes(id)?null:{research:id,name:this.researchNode(id)?.name||id};},
    productionItemLock(kind){return this.config.practiceResources?null:(this.config.production.unlocks||[]).find(r=>r.items.includes(kind)&&this.kills<r.kills)||this.productionResearchLock(this.config.production.items[kind]?.research);},
    recipeInputs(recipe){return recipe?.inputs|| (recipe?[{id:recipe.input,count:recipe.inputCount||1}]:[]);},
    batchRecipe(recipe){return !!recipe&&(this.recipeInputs(recipe).length>1||this.recipeInputs(recipe)[0].count!==1||recipe.outputCount!==1);},
    productionRecipeLock(recipe){return recipe&&(this.productionResearchLock(recipe.research)||this.recipeInputs(recipe).map(x=>this.productionItemLock(x.id)).find(Boolean)||this.productionItemLock(recipe.output));},
    productionLockText(lock){return lock.research?`需要研究：${lock.name}`:`${lock.name}未解锁 · 击杀 ${Math.min(this.kills,lock.kills)} / ${lock.kills}`;},
    productionUnitLock(unit){return this.productionResearchLock(this.config.production.types[unit.type]?.research)||this.productionItemLock(unit.source)||this.productionRecipeLock(this.productionRecipe(unit))||this.productionItemLock(unit.cargo?.kind);},
    warehouseCount(kind){return this.isRawMaterial(kind)?(this.productionItemLock(kind)?0:Infinity):(this.warehouse[kind]||0);},
    productionOptionError(type,value){
      const d=this.config.production.types[type],recipe=this.config.production.recipes.find(r=>r.machineId===d?.id&&r.id===value);
      const machineLock=this.productionResearchLock(d?.research);if(machineLock)return this.productionLockText(machineLock);
      if(d?.kind==='supply')return ['dp','warehouse','balanced'].includes(value)?'':'无效交付方式';
      if(!(d?.kind==='unloader'?d.sources.includes(value):d?.kind==='processor'&&recipe))return '此设备不支持该物品或配方';
      const lock=d.kind==='unloader'?this.productionItemLock(value):this.productionRecipeLock(recipe);
      return lock?this.productionLockText(lock):'';
    },
    warehouseConnections(){
      const kind=p=>this.config.production.types[p.type].kind,nodes=[...this.warehouseLine,...this.production].filter(p=>['hub','bus'].includes(kind(p))),byCell=new Map();
      for(const p of nodes){const f=this.productionRect(p);for(let y=p.y;y<p.y+f.depth;y++)for(let x=p.x;x<p.x+f.width;x++)byCell.set(`${x},${y}`,p);}
      const online=new Set(),queue=nodes.filter(p=>kind(p)==='hub');for(const p of queue)online.add(p.id);
      for(let i=0;i<queue.length;i++){const p=queue[i];for(let side=0;side<4;side++){const [dx,dy]=directions[side];for(const cell of this.edgeCells(p,side)){const next=byCell.get(`${cell.x+dx},${cell.y+dy}`);if(next&&!online.has(next.id)){online.add(next.id);queue.push(next);}}}}
      for(const p of this.production){const side=this.productionPorts(p).warehouse;if(side==null)continue;const [dx,dy]=directions[side];if(this.edgeCells(p,side).every(c=>online.has(byCell.get(`${c.x+dx},${c.y+dy}`)?.id)))online.add(p.id);}
      return online;
    },
    productionAt(x,y){return this.production.find(p=>this.productionContains(p,x,y))||this.warehouseLine.find(p=>this.productionContains(p,x,y));},
    productionPlacementError(type,x,y,dir=this.config.production?.types[type]?.defaultDir??0,ignoreId,preview=false){
      const ignores=id=>ignoreId instanceof Set?ignoreId.has(id):id===ignoreId;
      if(!['ready','running','paused'].includes(this.phase))return '演练已结束，请重新开始';
      if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=this.config.map.width||y>=this.config.map.height)return '请选择战场内的网格';
      if(!this.config.production?.types[type])return '未知生产设备';
      if(this.config.production.types[type].builtIn)return '仓库存取线已在地图底部自带，无需建造';
      if(ignoreId==null){const lock=this.productionResearchLock(this.config.production.types[type].research);if(lock)return this.productionLockText(lock);}
      if(!Number.isInteger(dir)||dir<0||dir>3)return '无效的出口方向';
      const f=this.productionFootprint(type,dir);if(x+f.width>this.config.map.width||y+f.depth>this.config.map.height)return '设备占地超出战场边界';
      for(let yy=y;yy<y+f.depth;yy++)for(let xx=x;xx<x+f.width;xx++){
        if(this.coreAt(xx,yy))return '协议核心占地不可建造';
        if(this.road.has(`${xx},${yy}`))return '敌人通道不能铺设产线';
        const other=this.productionAt(xx,yy);if(other?.fixed)return '这是自带的仓库存取线，请把存取口放在它上方';
        const tower=this.towerAt(xx,yy);
        if(other&&!ignores(other.id)||tower&&!ignores(tower.id))return '设备占地与已有设备重叠';
      }
      if(ignoreId==null&&!preview&&this.dp+1e-8<this.config.production.types[type].cost)return '部署费用不足';
      return '';
    },
    deployProduction(type,x,y,dir){
      dir??=this.config.production.types[type]?.defaultDir;
      const error=this.productionPlacementError(type,x,y,dir);if(error)return {error};
      if(!Number.isInteger(dir)||dir<0||dir>3)return {error:'无效的出口方向'};
      const def=this.config.production.types[type];this.dp-=def.cost;
      const unit={id:++this.serial,type,x,y,dir,cargo:null,work:0,delivered:0,buffer:{},processingIngredients:null,outputRemaining:0,source:def.sources?.[0],recipe:this.config.production.recipes.find(r=>r.machineId===def.id)?.id,deliveryMode:'dp',nextDelivery:'dp'};this.production.push(unit);return {unit};
    },
    productionRecipe(unit){return this.config.production.recipes.find(r=>r.id===unit.recipe);},
    setProductionOption(id,value){
      const p=this.production.find(p=>p.id===id);if(!p||!['ready','running','paused'].includes(this.phase))return '当前不能修改';
      const d=this.config.production.types[p.type];
      const error=this.productionOptionError(p.type,value);if(error)return error;
      if(d.kind==='supply'){p.deliveryMode=value;return '';}
      if(d.kind==='unloader'?p.source===value:p.recipe===value)return '';
      // Reconfiguration returns the actual held item, never its future recipe output.
      if(p.cargo&&!this.isRawMaterial(p.cargo.kind))this.warehouse[p.cargo.kind]=(this.warehouse[p.cargo.kind]||0)+1;
      const held={...p.buffer};for(const [kind,n] of Object.entries(p.processingIngredients||{}))held[kind]=(held[kind]||0)+n;
      if(p.outputRemaining){const kind=this.productionRecipe(p).output;held[kind]=(held[kind]||0)+p.outputRemaining;}
      for(const [kind,n] of Object.entries(held))if(!this.isRawMaterial(kind))this.warehouse[kind]=(this.warehouse[kind]||0)+n;
      p.cargo=null;p.work=0;p.buffer={};p.processingIngredients=null;p.outputRemaining=0;
      if(d.kind==='unloader')p.source=value;else p.recipe=value;
      return '';
    },
    rotateProduction(id){const p=this.production.find(p=>p.id===id);if(!p||this.productionPlacementError(p.type,p.x,p.y,(p.dir+1)%4,p.id))return false;p.dir=(p.dir+1)%4;return true;},
    removeProduction(id){
      const p=this.production.find(p=>p.id===id);if(!p||!['ready','running','paused'].includes(this.phase))return 0;
      const refund=this.config.production.types[p.type].cost;this.dp=Math.min(this.dpCapacity(),this.dp+refund);this.production=this.production.filter(other=>other!==p);return refund;
    },
    productionPorts(unit){
      const ports=this.config.production.types[unit.type].ports,turn=side=>(side+unit.dir)%4;
      return {inputs:ports.inputs.map(turn),outputs:ports.outputs.map(turn),warehouse:ports.warehouse==null?null:turn(ports.warehouse)};
    },
    productionPortMatches(from,to){
      const inputs=this.productionPortCells(to,'inputs');return this.productionPortCells(from,'outputs').some(o=>{const [dx,dy]=directions[o.side];return inputs.some(i=>i.x===o.x+dx&&i.y===o.y+dy&&i.side===(o.side+2)%4);});
    },
    productionAccepts(unit,kind,from){
      if(!from||!this.productionPortMatches(from,unit)||this.productionItemLock(kind)||this.productionUnitLock(unit))return false;
      const role=this.config.production.types[unit.type].kind;
      return !!this.config.production.items[kind]&&(role==='belt'||role==='loader'||role==='processor'&&this.recipeInputs(this.productionRecipe(unit)).some(x=>x.id===kind)||role==='supply'&&this.config.production.items[kind].value>0);
    },
    productionHasRoom(unit,kind){
      const recipe=this.productionRecipe(unit);
      if(this.config.production.types[unit.type].kind==='processor'&&this.batchRecipe(recipe)){
        const input=this.recipeInputs(recipe).find(x=>x.id===kind);return !!input&&(unit.buffer?.[kind]||0)<input.count;
      }return !unit.cargo;
    },
    receiveProduction(unit,kind){
      if(this.config.production.types[unit.type].kind==='processor'&&this.batchRecipe(this.productionRecipe(unit))){unit.buffer??={};unit.buffer[kind]=(unit.buffer[kind]||0)+1;}
      else unit.cargo={kind,age:0};
    },
    batchMissing(unit){return this.recipeInputs(this.productionRecipe(unit)).filter(x=>(unit.buffer?.[x.id]||0)<x.count).map(x=>`${this.config.production.items[x.id].name} ${unit.buffer?.[x.id]||0}/${x.count}`).join('、');},
    updateProductionBatch(p,recipe,dt){
      p.buffer??={};
      if(!p.processingIngredients&&!p.cargo&&!p.outputRemaining&&!this.batchMissing(p)){
        p.processingIngredients={};for(const x of this.recipeInputs(recipe)){p.buffer[x.id]-=x.count;p.processingIngredients[x.id]=x.count;}p.work=0;
      }
      if(p.processingIngredients){p.work+=dt;if(p.work+1e-8>=recipe.period){p.processingIngredients=null;p.work=0;p.cargo={kind:recipe.output,age:0};p.outputRemaining=recipe.outputCount-1;}}
    },
    productionOutputs(unit){const found=[];for(const p of this.productionPortCells(unit,'outputs')){const [dx,dy]=directions[p.side],next=this.productionAt(p.x+dx,p.y+dy);if(next&&next!==unit&&!found.includes(next))found.push(next);}return found;},
    productionOutput(unit){const candidates=this.productionOutputs(unit),kind=unit.cargo?.kind||this.productionRecipe(unit)?.output||unit.source;return candidates.find(n=>this.productionHasRoom(n,kind)&&this.productionAccepts(n,kind,unit))||candidates.find(n=>this.productionPortMatches(unit,n))||candidates[0]||null;},
    supplyDestination(p){return p.deliveryMode==='warehouse'?'warehouse':p.deliveryMode==='balanced'?(this.dp+ (this.config.production.items[p.cargo?.kind]?.value||0)>this.dpCapacity()?'warehouse':p.nextDelivery||'dp'):'dp';},
    productionStatus(p,online=this.warehouseConnections()){
      const d=this.config.production.types[p.type];
      const lock=this.productionUnitLock(p);if(lock)return this.productionLockText(lock);
      if(d.category==='warehouse'&&!online.has(p.id)){
        const nearby=directions.some(([dx,dy],side)=>this.edgeCells(p,side).some(c=>this.warehouseLine.some(n=>this.productionContains(n,c.x+dx,c.y+dy))));
        return nearby?'仓库接口朝向不匹配 · 存取暂停':'未贴靠底部存取线 · 存取暂停';
      }
      if(d.kind==='hub')return '仓库在线 · 原料无限供应';
      if(d.kind==='bus')return '存取线已接通';
      if(!p.cargo&&this.production.some(other=>this.productionOutput(other)===p&&!this.productionPortMatches(other,p)))return '入口朝向不匹配 · 无法进料';
      if(d.kind==='loader')return p.cargo?'正在入库':'等待物品入库';
      if(d.kind==='unloader'&&!p.cargo)return this.warehouseCount(p.source)>0?'正在取货':'成品库存不足';
      if(d.kind==='supply')return p.cargo?(this.supplyDestination(p)==='warehouse'?'正在存入材料':this.dp+this.config.production.items[p.cargo.kind].value>this.dpCapacity()?'折金票已满 · 暂存成品':'正在兑换折金票'):'等待成品';
      if(d.kind==='processor'&&this.batchRecipe(this.productionRecipe(p))){
        if(p.processingIngredients)return '合批加工中';
        if(!p.cargo)return this.batchMissing(p)?'等待配料 · '+this.batchMissing(p):'配料齐备';
      }
      if(d.kind==='processor'&&p.cargo?.kind===this.productionRecipe(p)?.input)return '加工中';
      if(p.cargo){const next=this.productionOutput(p);return !next?'出口未连接':!this.productionPortMatches(p,next)?'下游入口朝向不匹配':!this.productionAccepts(next,p.cargo.kind,p)?'下游不接收此物品':!this.productionHasRoom(next,p.cargo.kind)?'下游积压':'输送中';}
      return '等待物料';
    },
    updateProduction(dt){
      const cfg=this.config.production;if(!cfg)return;const online=this.warehouseConnections();
      for(const p of this.production){
        const d=cfg.types[p.type];
        if(this.productionUnitLock(p)){p.work=0;continue;}
        const batchRecipe=this.productionRecipe(p);
        if(d.kind==='processor'&&this.batchRecipe(batchRecipe)){if(p.cargo)p.cargo.age+=dt;this.updateProductionBatch(p,batchRecipe,dt);continue;}
        if(d.kind==='unloader'&&!p.cargo){
          if(online.has(p.id)&&this.warehouseCount(p.source)>0){p.work+=dt;if(p.work+1e-8>=d.period){p.work=0;if(!this.isRawMaterial(p.source))this.warehouse[p.source]--;p.cargo={kind:p.source,age:0};}}
          else p.work=0;
        }
        else if(p.cargo){
          p.cargo.age+=dt;
          if(d.kind==='loader'&&online.has(p.id)&&p.cargo.age+1e-8>=d.period){if(!this.isRawMaterial(p.cargo.kind))this.warehouse[p.cargo.kind]=(this.warehouse[p.cargo.kind]||0)+1;p.cargo=null;p.delivered++;continue;}
          const recipe=this.productionRecipe(p);
          if(d.kind==='processor'&&p.cargo.kind===recipe.input&&p.cargo.age+1e-8>=recipe.period)p.cargo={kind:recipe.output,age:0};
          const value=cfg.items[p.cargo.kind]?.value||0;
          if(d.kind==='supply'&&value>0&&p.cargo.age+1e-8>=d.period){
            const destination=this.supplyDestination(p);
            if(destination==='dp'&&this.dp+value>this.dpCapacity()+1e-8)continue;
            if(destination==='warehouse')this.warehouse[p.cargo.kind]=(this.warehouse[p.cargo.kind]||0)+1;
            else{
              this.dp=Math.min(this.dpCapacity(),this.dp+value);this.productionEarned+=value;
              this.productionReceipts.push({time:this.time,value});
              this.effects.push({kind:'income',...this.productionCenter(p),value,ttl:.9,total:.9});
            }
            p.nextDelivery=destination==='dp'?'warehouse':'dp';p.cargo=null;p.delivered++;
          }
        }
      }
      // Reserve destinations from a snapshot. A piece moves at most one cell
      // per tick, and two upstream devices cannot duplicate into one receiver.
      const transfers=[],reserved=new Set();
      for(const p of this.production){
        if(this.productionUnitLock(p))continue;
        const d=cfg.types[p.type];if(!p.cargo||['supply','loader'].includes(d.kind)||d.kind==='processor'&&p.cargo.kind!==this.productionRecipe(p).output)continue;
        if(d.kind==='unloader'&&!online.has(p.id))continue;
        if(p.cargo.age+1e-8<(d.kind==='belt'?d.period:0))continue;
        const next=this.productionOutputs(p).find(n=>this.productionHasRoom(n,p.cargo.kind)&&!reserved.has(n.id)&&this.productionAccepts(n,p.cargo.kind,p));
        if(next){reserved.add(next.id);transfers.push({from:p,to:next,kind:p.cargo.kind});}
      }
      for(const t of transfers){
        if(t.from.outputRemaining>0){t.from.outputRemaining--;t.from.cargo={kind:t.kind,age:0};}else t.from.cargo=null;
        this.receiveProduction(t.to,t.kind);
      }
      this.productionReceipts=this.productionReceipts.filter(r=>this.time-r.time<10);
    }
  };
  if(typeof module==='object'&&module.exports)module.exports=api;else root.BlueprintProduction=api;
})(globalThis);
