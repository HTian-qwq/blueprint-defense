(function(root) {
  'use strict';
  const key = (x,y) => `${x},${y}`;
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const DV=[[1,0],[0,1],[-1,0],[0,-1]];
  // Rotation convention recovered from the blueprint renderer's original tiles.
  const CORNER={0:{3:[1,180],1:[2,270]},1:{0:[1,90],2:[2,180]},2:{1:[1,0],3:[2,90]},3:{2:[1,270],0:[2,0]}};
  function makePath(corners) {
    const path = [{x:corners[0][0],y:corners[0][1]}];
    for (let i=1;i<corners.length;i++) {
      let {x,y} = path[path.length-1]; const [tx,ty] = corners[i];
      if (x!==tx && y!==ty) throw Error('路线只能沿网格连接');
      while(x!==tx || y!==ty) {x+=Math.sign(tx-x);y+=Math.sign(ty-y);path.push({x,y});}
    }
    return path;
  }
  function beltTiles(path) {
    const dir=(a,b)=>DV.findIndex(([x,y])=>b.x-a.x===x&&b.y-a.y===y);
    return path.map((p,i)=>{
      const from=i?dir(path[i-1],p):dir(p,path[i+1]), to=i<path.length-1?dir(p,path[i+1]):from;
      const corner=CORNER[(from+1)%4]?.[(to+1)%4];
      return {...p,from,to,sprite:corner?'icon_belt_corner_'+corner[0]:'icon_belt_grid',angle:corner?-corner[1]:to*90};
    });
  }
  function makeTrack(path) {
    const points=[{x:path[0].x+.5,y:path[0].y+.5}];
    for(let i=1;i<path.length-1;i++) {
      const prev=path[i-1],p=path[i],next=path[i+1],dx=p.x-prev.x,dy=p.y-prev.y,ox=next.x-p.x,oy=next.y-p.y;
      if(dx===ox&&dy===oy){points.push({x:p.x+.5,y:p.y+.5});continue;}
      const center={x:p.x+.5-dx*.5+ox*.5,y:p.y+.5-dy*.5+oy*.5};
      const angle=Math.atan2(-oy,-ox), turn=dx*oy-dy*ox;
      for(let j=0;j<=12;j++){const a=angle+turn*Math.PI/2*j/12;points.push({x:center.x+.5*Math.cos(a),y:center.y+.5*Math.sin(a)});}
    }
    points.push({x:path.at(-1).x+.5,y:path.at(-1).y+.5});
    let length=0;const segments=[];
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=distance(a,b);if(d<1e-9)continue;segments.push({a,b,start:length,length:d});length+=d;}
    return {segments,length};
  }
  class Game {
    constructor(config) {this.config=config;this.path=makePath(config.map.corners);this.belts=beltTiles(this.path);this.track=makeTrack(this.path);const end=config.map.core?.entrance;if(end){const a=this.track.segments.at(-1).b,length=distance(a,end);this.track.segments.push({a,b:end,start:this.track.length,length});this.track.length+=length;}this.road=new Set(this.path.map(p=>key(p.x,p.y)));this.reset();}
    reset() {
      this.phase='ready';this.time=0;this.dp=this.config.rules.initialDP;this.life=this.config.rules.life;
      this.wave=-1;this.waveTime=0;this.spawned=0;this.intermission=0;this.kills=0;this.leaked=0;
      this.towers=[];this.enemies=[];this.projectiles=[];this.pendingAttacks=[];this.effects=[];this.zones=[];this.audioEvents=[];this.serial=0;this.spent=0;this.boss=null;this.bossOutcome='';
      this.total=this.config.waves.reduce((n,w)=>n+w.enemies.length,0);
      this.reinforcements=0;this.waveReinforcements=0;this.enemyHazards=[];
      this.production=[];this.productionEarned=0;this.productionReceipts=[];
      this.warehouse={};
      this.initEconomy();
      this.initWarehouseLine();
    }
    start() {if(this.phase==='ready'){this.phase='running';this.beginWave();return true;}return false;}
    togglePause() {if(this.phase==='running')this.phase='paused';else if(this.phase==='paused')this.phase='running';}
    isPreparing(){return ['running','paused'].includes(this.phase)&&this.intermission>0&&this.wave<this.config.waves.length-1;}
    simulationRate(speed){return this.isPreparing()?1:speed;}
    beginWave() {this.wave++;this.waveTime=0;this.spawned=0;this.intermission=0;this.waveReinforcements=0;}
    nextWave() {if(this.phase!=='running'||!this.isPreparing())return false;this.beginWave();return true;}
    point(progress) {
      const at=Math.max(0,Math.min(progress,this.track.length));
      const seg=this.track.segments.find(s=>at<=s.start+s.length)||this.track.segments.at(-1);
      const f=(at-seg.start)/seg.length;return {x:seg.a.x+(seg.b.x-seg.a.x)*f,y:seg.a.y+(seg.b.y-seg.a.y)*f};
    }
    footprint(def){return def.footprint||{width:1,depth:1};}
    coreAt(x,y){const c=this.config.map.core;if(!c)return false;return x>=c.x&&y>=c.y&&x<c.x+c.footprint.width&&y<c.y+c.footprint.depth;}
    towerRect(t){return {x:t.x,y:t.y,...this.footprint(this.stats(t))};}
    towerCenter(t){const r=this.towerRect(t);return {x:r.x+r.width/2,y:r.y+r.depth/2};}
    towerAt(x,y){return this.towers.find(t=>{const r=this.towerRect(t);return x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.depth;});}
    footprintError(def,x,y,ignoreId){
      const r=this.footprint(def);
      const ignores=id=>ignoreId instanceof Set?ignoreId.has(id):id===ignoreId;
      if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x+r.width>this.config.map.width||y+r.depth>this.config.map.height)return '设备占地超出战场边界';
      for(let yy=y;yy<y+r.depth;yy++)for(let xx=x;xx<x+r.width;xx++){
        if(this.coreAt(xx,yy))return '协议核心占地不可建造';
        if(this.road.has(key(xx,yy)))return '设备占地与敌人通道重叠';
        const other=this.towerAt(xx,yy);if(other&&!ignores(other.id))return '设备占地与已有防御塔重叠';
        const production=this.productionAt(xx,yy);if(production&&(production.fixed||!ignores(production.id)))return '设备占地与生产设备或仓库存取线重叠';
      }
      return '';
    }
    placementError(type,x,y) {
      if(!['ready','running','paused'].includes(this.phase))return '演练已结束，请重新开始';
      if(!this.config.towers[type])return '未知设备';
      const space=this.footprintError(this.config.towers[type],x,y);if(space)return space;
      const resources=this.constructionError(this.config.towers[type]);if(resources)return resources;
      if(this.dp+1e-8<this.config.towers[type].cost)return '部署费用不足';
      return '';
    }
    deploy(type,x,y) {
      const error=this.placementError(type,x,y);if(error)return {error};
      const def=this.config.towers[type];this.dp-=def.cost;this.spent+=def.cost;
      if(this.config.economy)this.consumeMaterials(def.materials);
      const tower={id:++this.serial,type,x,y,level:1,cooldown:0,disabledUntil:0,spent:def.cost,kills:0,shots:0,animationStart:this.time,lastShotAt:-Infinity,facing:1,aimAngle:0,aimTargetId:null};this.towers.push(tower);this.cue(tower,'deploy',this.towerCenter(tower).x);return {tower};
    }
    cue(t,action,x,stats=this.stats(t),voice={}) {
      const key=stats.audio?.[action];if(!key)return;
      this.queueAudio(key,x,voice);
    }
    queueAudio(key,x,voice={}) {
      if(this.audioEvents.length>=64)this.audioEvents.shift();
      this.audioEvents.push({key,x,time:this.time,...voice});
    }
    drainAudioEvents(){return this.audioEvents.splice(0);}
    stats(t) {const d=this.config.towers[t.type];return {...d,damage:Math.round(d.damage*1.55**(t.level-1)),range:d.range+.3*(t.level-1),...(d.upgrades?.[t.level-2]||{})};}
    maxLevel(t){return 1+(this.config.towers[t.type].upgrades?.length??2);}
    upgradeCost(t) {return this.config.towers[t.type].upgrades?.[t.level-1]?.cost??Math.ceil(this.config.towers[t.type].cost*.8*t.level);}
    upgrade(id) {
      const t=this.towers.find(t=>t.id===id);if(!t || !['ready','running','paused'].includes(this.phase))return false;
      const cost=this.upgradeCost(t);if(this.upgradeError(t))return false;
      const next={...this.stats(t),...this.config.towers[t.type].upgrades[t.level-1]};
      if(this.config.economy)this.consumeMaterials(next.materials);
      t.ammoRemaining=0;t.awaitingSupply=false;
      this.dp-=cost;this.spent+=cost;t.spent+=cost;t.level++;t.shots=0;t.animationStart=this.time;t.lastShotAt=-Infinity;this.cue(t,'deploy',this.towerCenter(t).x);return true;
    }
    withdraw(id) {
      if(!['ready','running','paused'].includes(this.phase))return 0;
      const t=this.towers.find(t=>t.id===id);if(!t)return 0;
      const refund=this.refundValue(t);this.dp=Math.min(this.dpCapacity(),this.dp+refund);
      this.towers=this.towers.filter(other=>other!==t);this.pendingAttacks=this.pendingAttacks.filter(a=>a.owner!==t);return refund;
    }
    refundValue(t){const scale=this.config.currency?.perPoint||1;return Math.floor(t.spent*this.config.rules.refund*scale+1e-8)/scale;}
    spawn(type,multiplier,options={}) {
      const d=this.config.enemies[type], hp=Math.round(d.hp*multiplier);
      const shield=Math.round((d.shield||0)*multiplier);
      const enemy={id:++this.serial,type,progress:0,...this.point(0),hp,maxHp:hp,shield,maxShield:shield,slowUntil:0,armorBreakUntil:0,hitUntil:0,
        phase:1,nextDodge:0,nextBlink:0,nextCast:this.time+(d.boss?4:3),cast:null,multiplier,summons:0,baseMaxShield:shield};
      if(options.reinforcement){
        enemy.progress=Math.min(this.track.length-.01,Math.max(0,options.progress||0));Object.assign(enemy,this.point(enemy.progress));
        this.total++;this.reinforcements++;this.waveReinforcements++;
      }
      this.enemies.push(enemy);if(d.boss){this.boss=enemy;this.bossOutcome='active';}return enemy;
    }
    damage(t,e,d,ignoreArmor=false,armorWeight=1) {
      if(e.hp<=0)return;
      const def=this.config.enemies[e.type];
      if(def.dodgeCooldown&&this.time>=e.nextDodge){e.nextDodge=this.time+def.dodgeCooldown;this.effects.push({kind:'evade',x:e.x,y:e.y,ttl:.5,total:.5});return;}
      const armor=def.armor*(e.armorBreakUntil>this.time?.35:1);
      const value=Math.max(d*.05,d-(ignoreArmor?0:armor*armorWeight)),absorbed=Math.min(e.shield||0,value);
      e.shield=Math.max(0,(e.shield||0)-absorbed);e.hp-=value-absorbed;e.hitUntil=this.time+.16;
      if(e.hp<=0){
        if(e.cast&&def.boss)this.queueAudio('',e.x,{stopVoiceId:'boss'+e.id});
        e.hp=0;e.cast=null;this.kills++;t.kills++;this.effects.push({kind:'kill',x:e.x,y:e.y,ttl:.38,total:.38,color:this.config.towers[t.type].color});
        if(def.boss)this.bossOutcome='defeated';
        if(def.deathBurst)this.enemyHazards.push({id:++this.serial,x:e.x,y:e.y,start:this.time,until:this.time+def.deathBurst.windup,...def.deathBurst});
        if(def.deathHeal){
          for(const ally of this.enemies)if(ally!==e&&ally.hp>0&&!ally.escaped&&distance(e,ally)<=def.deathHeal.radius)ally.hp=Math.min(ally.maxHp,ally.hp+ally.maxHp*def.deathHeal.fraction);
          this.effects.push({kind:'enemyHeal',x:e.x,y:e.y,radius:def.deathHeal.radius,ttl:.9,total:.9});
        }
        return;
      }
      if(def.boss&&e.phase===1&&e.hp<=e.maxHp*.5){
        if(e.cast)this.queueAudio('',e.x,{stopVoiceId:'boss'+e.id});
        e.phase=2;e.shield=e.baseMaxShield=Math.round(e.maxHp*def.phaseShieldFraction);e.maxShield=Math.max(e.maxShield,e.baseMaxShield);e.cast=null;e.nextCast=this.time+2;
        this.effects.push({kind:'bossPhase',x:e.x,y:e.y,radius:3,ttl:1.2,total:1.2});
      }
      if(def.blink&&this.time>=e.nextBlink){
        const from={x:e.x,y:e.y};e.nextBlink=this.time+def.blink.cooldown;e.progress=Math.min(this.track.length,e.progress+def.blink.distance);Object.assign(e,this.point(e.progress));
        this.effects.push({kind:'blink',x:from.x,y:from.y,tx:e.x,ty:e.y,ttl:.55,total:.55});
      }
    }
    disableTower(t,duration){
      if(t.disabledUntil<=this.time)t.disabledSince=this.time;
      t.disabledUntil=Math.max(t.disabledUntil||0,this.time+duration);
      this.pendingAttacks=this.pendingAttacks.filter(a=>a.owner!==t);
    }
    updateEnemyAbilities(){
      for(const e of [...this.enemies]){
        if(e.hp<=0||e.escaped)continue;
        const d=this.config.enemies[e.type];
        if(e.cast){
          const c=e.cast;if(this.time+1e-8<c.until)continue;
          if(c.kind==='suppress'){
            const tower=this.towers.find(t=>t.id===c.targetId);
            if(tower){const center=this.towerCenter(tower);this.disableTower(tower,c.duration);this.effects.push({kind:'enemyShot',x:e.x,y:e.y,tx:center.x,ty:center.y,ttl:.4,total:.4});}
          }else if(c.kind==='heal'||c.kind==='ward'){
            const a=d[c.kind],allies=this.enemies.filter(ally=>ally!==e&&ally.hp>0&&!ally.escaped&&distance(e,ally)<=a.radius&&(c.kind!=='heal'||ally.hp<ally.maxHp))
              .sort((u,v)=>c.kind==='heal'?u.hp/u.maxHp-v.hp/v.maxHp||u.id-v.id:v.progress-u.progress||u.id-v.id).slice(0,a.targets);
            for(const ally of allies){
              if(c.kind==='heal')ally.hp=Math.min(ally.maxHp,ally.hp+ally.maxHp*a.fraction);
              else{ally.maxShield=Math.max(ally.baseMaxShield,Math.round(ally.maxHp*a.capFraction));ally.shield=Math.min(ally.maxShield,ally.shield+Math.round(ally.maxHp*a.fraction));}
            }
            this.effects.push({kind:c.kind==='heal'?'enemyHeal':'enemyWard',x:e.x,y:e.y,radius:a.radius,ttl:.8,total:.8});
          }else if(c.kind==='summon'){
            const a=d.summon;e.summons++;
            for(let n=0;n<a.count;n++)this.spawn(a.type,e.multiplier*a.hpScale,{reinforcement:true,progress:e.progress-.25*n});
            this.effects.push({kind:'enemySummon',x:e.x,y:e.y,radius:1.1,ttl:.8,total:.8});
          }else{
            for(const t of this.towers)if(distance(this.towerCenter(t),c)<=c.radius)this.disableTower(t,c.duration);
            this.effects.push({kind:'bossPulse',x:c.x,y:c.y,radius:c.radius,phase:e.phase,ttl:.8,total:.8});
            const key=d.audio?.[e.phase===2?'flame':'slam'];if(key)this.queueAudio(key,e.x,{stopVoiceId:'boss'+e.id});
          }
          e.cast=null;e.nextCast=this.time+c.interval;continue;
        }
        if(this.time<e.nextCast)continue;
        if(d.bossAttack){
          const a=d.bossAttack,second=e.phase===2;
          e.cast={kind:'boss',x:e.x,y:e.y,start:this.time,until:this.time+(second?a.phase2Windup:a.windup),
            radius:second?a.phase2Radius:a.radius,duration:second?a.phase2Duration:a.duration,interval:second?a.phase2Interval:a.interval};
          const key=d.audio?.[second?'flameCharge':'charge'];if(key)this.queueAudio(key,e.x,{voiceId:'boss'+e.id});
        }else if(d.summon&&e.summons<d.summon.limit){
          const a=d.summon;e.cast={kind:'summon',x:e.x,y:e.y,radius:1.1,start:this.time,until:this.time+a.windup,interval:a.interval};
        }else if(d.heal||d.ward){
          const kind=d.heal?'heal':'ward',a=d[kind];
          if(this.enemies.some(ally=>ally!==e&&ally.hp>0&&!ally.escaped&&distance(e,ally)<=a.radius&&(kind!=='heal'||ally.hp<ally.maxHp)))
            e.cast={kind,x:e.x,y:e.y,radius:a.radius,start:this.time,until:this.time+a.windup,interval:a.interval};
        }else if(d.suppress){
          const a=d.suppress,target=this.towers.filter(t=>distance(this.towerCenter(t),e)<=a.range)
            .sort((t,u)=>distance(this.towerCenter(t),e)-distance(this.towerCenter(u),e)||t.id-u.id)[0];
          if(target){const center=this.towerCenter(target);e.cast={kind:'suppress',targetId:target.id,tx:center.x,ty:center.y,start:this.time,until:this.time+a.windup,duration:a.duration,interval:a.interval};}
        }
      }
    }
    updateEnemyHazards(){
      for(const h of this.enemyHazards)if(this.time+1e-8>=h.until){
        for(const t of this.towers)if(distance(this.towerCenter(t),h)<=h.radius)this.disableTower(t,h.duration);
        this.effects.push({kind:'enemyBlast',x:h.x,y:h.y,radius:h.radius,ttl:.65,total:.65});
      }
      this.enemyHazards=this.enemyHazards.filter(h=>this.time+1e-8<h.until);
    }
    fire(t,stats,target) {
      if(t.disabledUntil>this.time)return;
      if(!this.loadAmmunition(t,stats))return;
      t.cooldown=stats.interval;
      if(!stats.burst){this.launchShot(t,stats,target);return;}
      // Snapshot the entire volley: an in-progress refit affects the next one.
      const b=stats.burst;
      for(let i=0;i<b.weights.length;i++){
        const empowered=i===b.enhancedIndex,splash=empowered&&b.splashLast;
        const pulse={...stats,damage:stats.damage*b.weights[i],armorWeight:b.weights[i],
          mode:splash?'splash':'single',empowered,empowerSplash:splash,burstShot:true,
          duration:(b.hitFrames[i]-b.launchFrames[i])/b.fps,muteFire:true,muteHit:!b.hitAudioFrames.includes(b.hitFrames[i])};
        this.pendingAttacks.push({delay:b.launchFrames[i]/b.fps,owner:t,stats:pulse,targetId:target.id,action:'shot'});
      }
      for(const frame of b.fireFrames)this.pendingAttacks.push({delay:frame/b.fps,owner:t,stats,targetId:target.id,action:'sound'});
      this.updateProjectiles(0);
    }
    selectTarget(t,stats){
      const p=this.towerCenter(t);
      return this.enemies.filter(e=>e.hp>0&&this.canTarget(stats,e)&&distance(p,e)<=stats.range)
        .sort((a,b)=>(stats.mode==='snipe'||stats.highThreat?(this.config.enemies[b.type].threat||0)-(this.config.enemies[a.type].threat||0):0)||b.progress-a.progress||a.id-b.id)[0];
    }
    aimTower(t,target){
      t.aimTargetId=target?.id??null;if(!target)return;
      const center=this.towerCenter(t),dx=target.x-center.x,dy=target.y-center.y;
      if(Math.hypot(dx,dy)<1e-6)return;
      t.aimAngle=Math.atan2(dy,dx);
      // A narrow dead band prevents left/right flicker as a target passes
      // almost directly above or below the tower. Idle retains its last pose.
      if(Math.abs(dx)>.3)t.facing=dx<0?-1:1;
    }
    launchShot(t,stats,target) {
      t.shots=(t.shots||0)+1;
      const empowered=!!stats.empowered;
      const origin=this.towerCenter(t),shotId=++this.serial;t.lastShotAt=this.time;
      if(stats.easterEgg)this.aimTower(t,target);
      if(!stats.muteFire)this.cue(t,stats.audio?.charge?'charge':'fire',origin.x,stats,stats.mode==='flame'?{voiceId:shotId}:{});
      if(stats.audio?.voice)this.cue(t,'voice',origin.x,stats);
      const duration=stats.duration??{single:.1,splash:.48,slow:.34,pierce:.22,chain:.12,snipe:.14,acid:.42,flame:.16}[stats.mode];
      this.projectiles.push({id:shotId,kind:stats.burstShot?'single':stats.mode,x:origin.x,y:origin.y,tx:target.x,ty:target.y,
        remaining:duration,total:duration,targetId:target.id,owner:t,stats,empowered:!!empowered});
      if(stats.mode==='single'||stats.mode==='snipe'||stats.burstShot)this.effects.push({kind:'muzzle',x:origin.x,y:origin.y,angle:Math.atan2(target.y-origin.y,target.x-origin.x),ttl:.08,total:.08,color:stats.color});
    }
    resolveShot(shot) {
      const {owner:t,stats}=shot,origin={x:shot.x,y:shot.y},target={x:shot.tx,y:shot.ty};
      if(stats.audio?.charge)this.cue(t,'fire',origin.x,stats);
      if(!stats.muteHit)this.cue(t,shot.empowered&&stats.empowerSplash?'hitBomb':'hit',target.x,stats);
      const effect={id:shot.id,kind:stats.mode,x:target.x,y:target.y,ttl:.65,total:.65,color:stats.color,radius:stats.splashRadius,easterEgg:stats.easterEgg};
      if(stats.mode==='flame') {
        this.zones.push({id:shot.id,kind:'fire',x:target.x,y:target.y,radius:1.05,ttl:3,total:3,tick:.25,owner:t,damage:stats.damage,audioStats:stats});
        effect.ttl=effect.total=.45;
      } else if(stats.mode==='chain') {
        const first=this.enemies.find(e=>e.id===shot.targetId&&e.hp>0),seen=new Set(),points=[origin];let current=first;
        for(let bounce=0;current&&bounce<3;bounce++){
          seen.add(current.id);points.push({x:current.x,y:current.y});this.damage(t,current,stats.damage*.8**bounce,true);
          current=this.enemies.filter(e=>e.hp>0&&!seen.has(e.id)&&distance(e,current)<=2.1).sort((a,b)=>distance(a,current)-distance(b,current)||a.id-b.id)[0];
        }
        effect.points=points;effect.ttl=effect.total=.4;
        if(stats.orbDps&&first)this.zones.push({id:shot.id,kind:'electric',x:target.x,y:target.y,radius:1.2,ttl:3,total:3,tick:.25,owner:t,damage:stats.orbDps});
      } else if(['splash','mortar','slow','acid'].includes(stats.mode)) {
        for(const e of this.enemies)if(e.hp>0 && this.canTarget(stats,e) && distance(e,target)<=(stats.splashRadius??1.25)){
          this.damage(t,e,stats.damage,!['splash','mortar'].includes(stats.mode),stats.armorWeight??1);
          if(stats.mode==='slow')e.slowUntil=this.time+3;
          if(stats.mode==='acid')e.armorBreakUntil=this.time+6;
        }
        if(stats.burnDps)this.zones.push({id:shot.id,kind:'fire',x:target.x,y:target.y,radius:1.25,ttl:3,total:3,tick:.25,owner:t,damage:stats.burnDps});
      } else if(stats.mode==='pierce') {
        const dx=target.x-origin.x,dy=target.y-origin.y,len=Math.hypot(dx,dy)||1;
        effect.x=origin.x;effect.y=origin.y;effect.tx=origin.x+dx/len*stats.range;effect.ty=origin.y+dy/len*stats.range;
        effect.ttl=effect.total=.5;
        const candidates=this.enemies.filter(e=>{
          const ex=e.x-origin.x,ey=e.y-origin.y,along=(ex*dx+ey*dy)/len;
          return e.hp>0 && along>=0 && along<=stats.range && Math.abs(ex*dy-ey*dx)/len<.5;
        }).sort((a,b)=>distance(origin,a)-distance(origin,b)).slice(0,3);
        for(const e of candidates)this.damage(t,e,stats.damage,true);
      } else {
        const enemy=this.enemies.find(e=>e.id===shot.targetId&&e.hp>0);
        if(enemy)this.damage(t,enemy,stats.damage,false,stats.armorWeight??1);
        effect.ttl=effect.total=.24;
      }
      this.effects.push(effect);
    }
    canTarget(stats,e){return stats.targets!=='ground'||!this.config.enemies[e.type].flying;}
    updateZones(dt){
      for(const zone of this.zones){
        const active=Math.min(dt,zone.ttl);zone.ttl-=dt;zone.tick-=active;
        while(zone.tick<=1e-8){
          for(const e of this.enemies)if(e.hp>0&&(zone.kind==='electric'||!this.config.enemies[e.type].flying)&&distance(e,zone)<=zone.radius)this.damage(zone.owner,e,zone.damage*.25,true);
          zone.tick+=.25;
        }
        if(zone.ttl<=1e-8&&zone.audioStats)this.cue(zone.owner,'end',zone.x,zone.audioStats,{stopVoiceId:zone.id});
      }
      this.zones=this.zones.filter(z=>z.ttl>1e-8);
    }
    updateProjectiles(dt) {
      let remain=dt;
      // Split at authored launch/sound frames so a coarse simulation step cannot
      // turn a volley into simultaneous hits or damage newly fired shots early.
      for(;;){
        const due=this.pendingAttacks.filter(a=>a.delay<=1e-8);
        this.pendingAttacks=this.pendingAttacks.filter(a=>a.delay>1e-8);
        for(const a of due){
          if(!this.towers.includes(a.owner)||a.owner.disabledUntil>this.time)continue;
          const origin=this.towerCenter(a.owner);
          const target=this.enemies.find(e=>e.id===a.targetId&&e.hp>0&&this.canTarget(a.stats,e)&&distance(origin,e)<=a.stats.range)||this.selectTarget(a.owner,a.stats);
          if(!target)continue;
          if(a.action==='sound')this.cue(a.owner,'fire',origin.x,a.stats);
          else this.launchShot(a.owner,a.stats,target);
        }
        if(remain<=1e-8)break;
        const part=Math.min(remain,...this.pendingAttacks.map(a=>a.delay));
        this.advanceProjectiles(part);for(const a of this.pendingAttacks)a.delay-=part;remain-=part;
      }
    }
    advanceProjectiles(dt) {
      for(const shot of this.projectiles){
        const target=this.enemies.find(e=>e.id===shot.targetId&&e.hp>0);
        if(target){shot.tx=target.x;shot.ty=target.y;}
        shot.remaining-=dt;if(shot.remaining<=1e-8)this.resolveShot(shot);
      }
      this.projectiles=this.projectiles.filter(s=>s.remaining>1e-8);
    }
    step(dt) {
      if(this.phase!=='running')return;
      if(!Number.isFinite(dt)||dt<=0||dt>.1)throw Error('Simulation step must be within (0, 0.1] seconds');
      this.time+=dt;this.updateResearch(dt);this.dp=Math.min(this.dpCapacity(),this.dp+dt*this.config.rules.dpPerSecond);
      this.effects=this.effects.filter(e=>(e.ttl-=dt)>0);
      this.updateProduction(dt);
      if(this.intermission>0) {this.intermission=Math.max(0,this.intermission-dt);if(this.intermission<1e-8)this.beginWave();}
      else {
        const w=this.config.waves[this.wave];this.waveTime+=dt;
        while(this.spawned<w.enemies.length && this.waveTime>=this.spawned*w.gap) {this.spawn(w.enemies[this.spawned],w.hp);this.spawned++;}
      }
      for(const e of this.enemies) {
        if(e.hp<=0)continue;
        const d=this.config.enemies[e.type],slow=e.slowUntil>this.time?1-.6*(1-(d.slowResistance||0)):1;
        if(!e.cast)e.progress+=dt*d.speed*slow*(d.rageSpeed&&e.hp<e.maxHp/2?d.rageSpeed:1)*(d.boss&&e.phase===2?d.phaseSpeed:1);
        Object.assign(e,this.point(e.progress));
        if(e.progress>=this.track.length) {e.escaped=true;e.cast=null;this.leaked++;this.life=Math.max(0,this.life-d.leak);if(d.boss)this.bossOutcome='escaped';}
      }
      this.enemies=this.enemies.filter(e=>!e.escaped&&e.hp>0);
      if(this.life<=0){this.phase='lost';return;}
      this.updateProjectiles(dt);
      this.updateZones(dt);
      this.updateEnemyHazards();
      this.updateEnemyAbilities();
      for(const t of this.towers) {
        t.cooldown=Math.max(0,t.cooldown-dt);if(t.disabledUntil>this.time)continue;
        const stats=this.stats(t);if(t.cooldown>0&&!stats.easterEgg)continue;
        const target=this.selectTarget(t,stats);
        if(stats.easterEgg)this.aimTower(t,target);
        if(target&&t.cooldown<=0)this.fire(t,stats,target);
      }
      this.enemies=this.enemies.filter(e=>e.hp>0);
      const w=this.config.waves[this.wave];
      if(!this.intermission && this.spawned===w.enemies.length && !this.enemies.length && !this.projectiles.length && !this.pendingAttacks.length && !this.enemyHazards.length) {
        if(this.wave===this.config.waves.length-1)this.phase='won';else this.intermission=this.config.rules.intermission;
      }
    }
    advance(seconds) {for(let remain=seconds;remain>1e-8 && this.phase==='running';remain-=.05)this.step(Math.min(.05,remain));}
  }
  Object.assign(Game.prototype,typeof module==='object'&&module.exports?require('./production.js'):root.BlueprintProduction);
  Object.assign(Game.prototype,typeof module==='object'&&module.exports?require('./economy.js'):root.BlueprintEconomy);
  Object.assign(Game.prototype,typeof module==='object'&&module.exports?require('./placement.js'):root.BlueprintPlacement);
  const api={Game,makePath,beltTiles,makeTrack};if(typeof module==='object'&&module.exports)module.exports=api;else root.BlueprintTD=api;
})(typeof globalThis==='object'?globalThis:this);
