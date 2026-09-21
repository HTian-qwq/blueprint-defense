'use strict';
let movingId=null,snapEnabled=true,rotationLocked=false,placementAlt=false,beltDraft=null;
let placementMemo=null;
function invalidatePlacement(){placementMemo=null;bulkMemo=null;}
function activeBuild(){
  const p=game.production.find(p=>p.id===movingId),t=game.towers.find(t=>t.id===movingId);
  if(p)return {def:DATA.production.types[p.type],type:p.type,production:true,unit:p};
  if(t)return {def:game.stats(t),type:t.type,production:false,unit:t};
  return choice<0?null:{def:choiceDef(),type:productionChoice()?choice-towerCount:choice,production:productionChoice(),unit:null};
}
function placementPlan(at=hover){
  const build=activeBuild();if(!build||!at)return null;
  const k=[at.x,at.y,choice,movingId,buildDirection,rotationLocked,snapEnabled,placementAlt,game.serial,game.production.length,game.towers.length].join('/');
  if(!placementMemo||placementMemo.key!==k){
    const p=build.production?game.suggestProduction(build.type,at.x,at.y,buildDirection,{snap:snapEnabled&&!placementAlt,rotate:!rotationLocked,ignoreId:movingId??undefined}):{x:at.x,y:at.y,dir:0,count:0,dock:false,snapped:false};
    placementMemo={key:k,plan:{...p,...build}};
  }
  const p=placementMemo.plan;
  const option=p.production&&!p.unit&&productionOptions.get(p.def.id);
  return {...p,error:movingId!=null?game.moveError(movingId,p.x,p.y,p.dir):p.production?(option&&game.productionOptionError(p.type,option))||game.productionPlacementError(p.type,p.x,p.y,p.dir):game.placementError(p.type,p.x,p.y)};
}
function beginMove(){
  if(batchSelection.size){beginBulkMove();return;}
  const unit=game.production.find(p=>p.id===selected)||game.towers.find(t=>t.id===selected);if(!unit||!['ready','running','paused'].includes(game.phase))return;
  movingId=unit.id;choice=-1;buildDirection=unit.dir??0;rotationLocked=true;hover=null;invalidatePlacement();updateUI();say('移动位置：点击空地确认，R 调整机械朝向，Esc 取消。原有物料、升级和冷却会保留。');
}
function copySelection(){
  const p=game.production.find(p=>p.id===selected),t=game.towers.find(t=>t.id===selected);if(!p&&!t)return;
  const def=p?DATA.production.types[p.type]:DATA.towers[t.type],option=p&&productionOptionValue(def,p),dir=p?.dir;
  selectType(p?towerCount+p.type:t.type);if(p){buildDirection=dir;rotationLocked=true;if(option)productionOptions.set(def.id,option);}
  invalidatePlacement();updateUI();say(`继续建造${def.name}${p?'，已带入配方和朝向':'（基础型）'}；点击空地放置。`);
}
function updateBuildTools(){
  updateBulkTools();
  const unit=game.production.find(p=>p.id===selected)||game.towers.find(t=>t.id===selected),ended=['won','lost'].includes(game.phase);
  $('copyBtn').hidden=!unit;$('moveBtn').hidden=!unit;$('copyBtn').disabled=ended;$('moveBtn').disabled=ended;
  $('moveBtn').textContent=movingId!=null?'移动中 · 点击空地确认':'移动位置 · M';
  $('snapBtn').setAttribute('aria-pressed',String(snapEnabled));$('snapBtn').textContent='对齐 '+(snapEnabled?'开':'关');
}
function startBeltDraft(at){beltDraft={cells:[at],plan:null};extendBeltDraft(at);}
function beltPlanStamp(){return [game.dp,game.phase,game.serial,game.production.length,game.towers.length,rotationLocked,buildDirection].join('/');}
function extendBeltDraft(at){
  if(!beltDraft)return;const cells=beltDraft.cells;
  at={x:Math.max(-1,Math.min(DATA.map.width,at.x)),y:Math.max(-1,Math.min(DATA.map.height,at.y))};
  let current=cells.at(-1);while(current.x!==at.x||current.y!==at.y){
    const dx=at.x-current.x,dy=at.y-current.y;
    const next=Math.abs(dx)>=Math.abs(dy)?{x:current.x+Math.sign(dx),y:current.y}:{x:current.x,y:current.y+Math.sign(dy)};
    const earlier=cells.findIndex(c=>c.x===next.x&&c.y===next.y);if(earlier>=0)cells.splice(earlier+1);else cells.push(next);
    current=next;if(cells.length>DATA.map.width*DATA.map.height)break;
  }
  beltDraft.plan=game.planBeltPath(cells,rotationLocked||cells.length===1?buildDirection:undefined);
  beltDraft.stamp=beltPlanStamp();
}
function finishBeltDraft(){
  if(!beltDraft)return;const cells=beltDraft.cells,result=game.deployBeltPath(cells,rotationLocked||cells.length===1?buildDirection:undefined);beltDraft=null;invalidatePlacement();
  if(result.error)say(result.error+'；未扣款。',true);
  else{buildDirection=result.path.at(-1).dir;say(`已铺设 ${result.path.length} 格传送带，花费 ${money(result.cost)} 折金票。可以继续拖拽铺设。`);}
  updateUI();
}
function drawBuildPreview(){
  const tooltip=$('placementPreview');tooltip.hidden=true;
  if(beltDraft?.plan){
    // Recheck money and occupancy while enemies and production keep running.
    const stamp=beltPlanStamp();if(beltDraft.stamp!==stamp){beltDraft.plan=game.planBeltPath(beltDraft.cells,rotationLocked||beltDraft.cells.length===1?buildDirection:undefined);beltDraft.stamp=stamp;}
    const plan=beltDraft.plan,path=plan.path;
    for(let i=0;i<path.length;i++){
      const cell=path[i],p=screen(cell.x,cell.y),s=view.s;
      let {img,angle}=productionArt(DATA.production.types[cell.type],cell.dir);
      if(i>0){const [dx,dy]=[[1,0],[0,1],[-1,0],[0,-1]][cell.dir],tile=BlueprintTD.beltTiles([path[i-1],cell,{x:cell.x+dx,y:cell.y+dy}])[1];img=images.get(tile.sprite);angle=tile.angle*Math.PI/180;}
      ctx.save();ctx.globalAlpha=.7;ctx.translate(p.x+s/2,p.y+s/2);ctx.rotate(angle);if(img)ctx.drawImage(img,-s/2,-s/2,s,s);ctx.restore();
      ctx.fillStyle=plan.error?'#ce5d615c':'#58b3ad48';ctx.fillRect(p.x,p.y,s,s);ctx.strokeStyle=plan.error?'#b94e50':'#438c8a';ctx.strokeRect(p.x,p.y,s,s);drawOutput(cell.x,cell.y,cell.dir);
    }
    const last=path.at(-1);if(last)showPlacementHint(last,plan.error||`${path.length} 格 · ${money(plan.cost)} 折金票 · 松开铺设`,!!plan.error);
    return;
  }
  const plan=placementPlan();if(!plan)return;
  const p=screen(plan.x,plan.y),foot=plan.production?game.productionFootprint(plan.type,plan.dir):game.footprint(plan.def),w=foot.width*view.s,h=foot.depth*view.s;
  const {img,angle}=plan.production?productionArt(plan.def,plan.dir):{img:images.get(plan.def.easterEgg?'battle_rocket_1':plan.def.id),angle:0};
  ctx.save();ctx.globalAlpha=.6;ctx.translate(p.x+w/2,p.y+h/2);ctx.rotate(angle);if(img)ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();
  ctx.fillStyle=plan.error?'#dc66594a':'#64b5b840';ctx.fillRect(p.x,p.y,w,h);ctx.strokeStyle=plan.error?'#b25a4e':'#4e999d';ctx.lineWidth=2;ctx.strokeRect(p.x,p.y,w,h);
  if(plan.production)drawProductionPorts(plan);
  const connection=plan.dock?'仓库接口已对齐':plan.count?`已对齐 ${plan.count} 处接口`:'点击放置';
  showPlacementHint(plan,plan.error||`${movingId!=null?'移动 · ':''}${connection}${plan.snapped?' · 自动对齐':''}${plan.production?' · '+directionNames[plan.dir]:''}`,!!plan.error);
}
function showPlacementHint(at,text,error){
  const el=$('placementPreview'),p=screen(at.x,at.y);el.hidden=false;el.textContent=text;el.classList.toggle('invalid',error);
  el.style.left=Math.max(5,Math.min(view.w-Math.min(260,view.w-10)-5,p.x+view.s+10))+'px';el.style.top=Math.max(5,Math.min(view.h-56,p.y+view.s+12))+'px';
}
function drawMovedOrigin(unit,production){
  const r=production?game.productionRect(unit):game.towerRect(unit),p=screen(r.x,r.y);ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle='#778b8988';ctx.strokeRect(p.x,p.y,r.width*view.s,r.depth*view.s);ctx.restore();
}
