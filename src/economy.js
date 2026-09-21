(function(root){
  'use strict';
  const api={
    initEconomy(){
      this.researched=[];this.researchJob=null;
      if(this.config.practiceResources){
        this.researched=(this.config.economy?.nodes||[]).map(n=>n.id);
        for(const item of Object.values(this.config.production.items))if(!this.isRawMaterial(item.id))this.warehouse[item.id]=60;
      }
    },
    dpCapacity(){return Math.max(this.config.rules.maxDP,...(this.config.economy?.nodes||[]).filter(n=>this.researched.includes(n.id)).map(n=>n.dpCapacity||0));},
    researchNode(id){return this.config.economy?.nodes.find(n=>n.id===id);},
    materialText(materials){return Object.entries(materials||{}).map(([id,n])=>`${this.config.production.items[id].name} ×${n}`).join('、');},
    materialError(materials){
      for(const [id,n] of Object.entries(materials||{})){
        const lock=this.productionItemLock(id);if(lock)return this.productionLockText(lock);
        if(this.warehouseCount(id)<n)return `${this.config.production.items[id].name}不足（${this.warehouseCount(id)} / ${n}）`;
      }return '';
    },
    consumeMaterials(materials){for(const [id,n] of Object.entries(materials||{}))this.warehouse[id]-=n;},
    constructionError(def){
      if(!this.config.economy)return '';
      if(def.research&&!this.researched.includes(def.research))return '需要研究：'+this.researchNode(def.research).name;
      return this.materialError(def.materials);
    },
    researchError(id){
      const n=this.researchNode(id);
      if(!n)return '未知科技';
      if(!['ready','running','paused'].includes(this.phase))return '演练已结束';
      if(this.researched.includes(id))return '已完成研究';
      if(this.researchJob)return '已有研究进行中';
      const missing=n.requires.filter(id=>!this.researched.includes(id));
      if(missing.length)return '前置：'+missing.map(id=>this.researchNode(id).name).join('、');
      if(this.dp+1e-8<n.cost)return '部署费用不足';
      return this.materialError(n.materials);
    },
    startResearch(id){
      const error=this.researchError(id);if(error)return {error};
      const n=this.researchNode(id);this.dp-=n.cost;this.consumeMaterials(n.materials);
      this.researchJob={id,remaining:n.seconds};return {job:this.researchJob};
    },
    updateResearch(dt){
      if(!this.researchJob)return;
      this.researchJob.remaining=Math.max(0,this.researchJob.remaining-dt);
      if(this.researchJob.remaining<=1e-8){this.researched.push(this.researchJob.id);this.researchJob=null;}
    },
    upgradeError(t){
      if(!t||!['ready','running','paused'].includes(this.phase))return '当前无法升级';
      if(t.level>=this.maxLevel(t))return '已达路线终点';
      const next={...this.stats(t),...this.config.towers[t.type].upgrades[t.level-1]};
      return this.footprintError(next,t.x,t.y,t.id)||this.constructionError(next)||(this.dp+1e-8<this.upgradeCost(t)?'部署费用不足':'');
    },
    ammunitionError(t,stats=this.stats(t)){
      if(!this.config.economy||!stats.ammo||t.ammoRemaining>0)return '';
      return this.materialError({[stats.ammo.item]:1});
    },
    loadAmmunition(t,stats){
      if(!this.config.economy||!stats.ammo)return true;
      if(this.ammunitionError(t,stats)){t.awaitingSupply=true;return false;}
      if(!(t.ammoRemaining>0)){this.consumeMaterials({[stats.ammo.item]:1});t.ammoRemaining=stats.ammo.volleys;}
      t.ammoRemaining--;t.awaitingSupply=false;return true;
    }
  };
  if(typeof module==='object'&&module.exports)module.exports=api;else root.BlueprintEconomy=api;
})(globalThis);
