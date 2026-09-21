'use strict';
const batchSelection=new Set();
let boxMode=false,selectionBox=null,groupMove=null,bulkMemo=null,bulkListStamp='',reverseBox=false,pendingDemolition=null;
const BULK_DELETE_CONFIRM_COUNT=5;
function clearBulkTools(){batchSelection.clear();selectionBox=null;groupMove=null;boxMode=false;reverseBox=false;bulkMemo=null;}
function setBatchSelection(ids){
  batchSelection.clear();const valid=new Set(game.placedBuildings().map(({unit})=>unit.id));
  for(const id of ids)if(valid.has(id))batchSelection.add(id);
  selected=batchSelection.size===1?[...batchSelection][0]:null;choice=-1;movingId=null;hover=null;groupMove=null;bulkMemo=null;
}
function toggleBoxMode(){
  const enabled=!boxMode;boardInput.stop();cancel();boardInput.setPan(false);boxMode=enabled;updateUI();
  say(enabled?'批量操作：左键点选增减，左键框选追加，右键框选移除；长按左键或 M 移动，F 拆除，X / Esc 退出。':'已退出批量操作。X 再次进入；Shift 拖拽也可快速框选。');
}
function beginSelectionBox(at,add,remove=false){
  const base=add?new Set(batchSelection):new Set();
  if(add&&selected!=null&&game.placedBuildings().some(({unit})=>unit.id===selected))base.add(selected);
  choice=-1;movingId=null;beltDraft=null;groupMove=null;hover=null;bulkMemo=null;
  selectionBox={start:at,end:at,base,add,remove,dragged:false};
}
function selectionRect(){
  const {start:a,end:b}=selectionBox;
  return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x)+1,depth:Math.abs(a.y-b.y)+1};
}
function selectionPreview(dragged=selectionBox?.dragged){
  if(!selectionBox)return new Set(batchSelection);
  const {end,base,add,remove}=selectionBox,ids=new Set(base);
  if(dragged){for(const id of game.buildingsInRect(selectionRect()))remove?ids.delete(id):ids.add(id);}
  else{
    const unit=game.towerAt(end.x,end.y)||game.productionAt(end.x,end.y);
    if(unit&&!unit.fixed){if(remove||add&&ids.has(unit.id))ids.delete(unit.id);else ids.add(unit.id);}
  }
  return ids;
}
function finishSelectionBox(dragged){
  if(!selectionBox)return;const ids=selectionPreview(dragged);
  selectionBox=null;setBatchSelection(ids);updateUI();
  say(batchSelection.size?`已选中 ${batchSelection.size} 台设备；继续左键框选追加，右键框选移除，M 移动，F 拆除。`:'当前未选中设备。左键框选追加；X / Esc 退出批量操作。');
}
function beginBulkMove(grab){
  if(groupMove)return;
  const selection=game.bulkSelection(batchSelection);if(selection.error||!['ready','running','paused'].includes(game.phase))return;
  boardInput.setPan(false);
  const x=Math.min(...selection.members.map(({rect})=>rect.x)),y=Math.min(...selection.members.map(({rect})=>rect.y));
  groupMove={x,y,returnToBatch:boxMode,grab:grab?{x:grab.x-x,y:grab.y-y}:{x:0,y:0}};movingId=null;choice=-1;selected=null;boxMode=false;selectionBox=null;hover=grab||{x,y};bulkMemo=null;updateUI();
  say(`正在移动 ${batchSelection.size} 台设备；左键点击确认，右键 / Esc 返回选区。保留配方、物料、朝向和升级。`);
}
function bulkMovePlan(){
  if(!groupMove||!hover)return null;
  const dx=hover.x-groupMove.x-groupMove.grab.x,dy=hover.y-groupMove.y-groupMove.grab.y,key=[dx,dy,game.phase,game.serial,game.production.length,game.towers.length].join('/');
  if(!bulkMemo||bulkMemo.key!==key)bulkMemo={key,plan:game.planBulkMove(batchSelection,dx,dy)};
  return bulkMemo.plan;
}
function commitBulkMove(at){
  const result=game.moveBuildings(batchSelection,at.x-groupMove.x-groupMove.grab.x,at.y-groupMove.y-groupMove.grab.y);
  if(result.error)say(result.error+'；整组未移动。',true);
  else{boxMode=groupMove.returnToBatch;groupMove=null;hover=null;say(`已移动 ${batchSelection.size} 台设备，原有配置与物料已保留。`);}
  bulkMemo=null;updateUI();
}
function cancelBulkMove(){boxMode=groupMove.returnToBatch;groupMove=null;hover=null;bulkMemo=null;updateUI();say('已取消移动，设备保留在原位，选区已恢复。');}
function finishDemolition(ids){
  const result=game.removeBuildings(ids);if(result.error){say(result.error,true);return;}
  const keepMode=boxMode;cancel();boxMode=keepMode;updateUI();say(`已拆除 ${result.count} 台设备，返还 ${money(result.credited)} 折金票${result.credited+1e-8<result.refund?'（已达容量上限）':''}。`);
}
function deleteSelection(){
  if(selectionBox){say('请先完成或取消框选，再拆除设备。',true);return;}
  if(groupMove||movingId!=null){say('请先确认或取消移动，再拆除设备。',true);return;}
  const ids=batchSelection.size?[...batchSelection]:game.placedBuildings().some(({unit})=>unit.id===selected)?[selected]:[];
  if(!ids.length)return;
  if(!['ready','running','paused'].includes(game.phase))return;
  if(ids.length>=BULK_DELETE_CONFIRM_COUNT){pendingDemolition=ids;updateUI();$('bulkDeleteDialog').showModal();$('cancelBulkDelete').focus();}
  else finishDemolition(ids);
}
function updateBulkTools(){
  const displayIds=selectionBox?.dragged?selectionPreview():batchSelection,summary=game.bulkSelection(displayIds),ended=!['ready','running','paused'].includes(game.phase),busy=!!groupMove||!!selectionBox;
  $('bulkToolbar').hidden=!boxMode&&!batchSelection.size;$('bulkToolbar').classList.toggle('is-dragging',!!selectionBox?.dragged);$('boxSelectBtn').setAttribute('aria-pressed',String(boxMode));
  $('bulkCount').textContent=`已选 ${summary.members.length} 台`;
  const rects=summary.members.map(m=>m.rect),width=rects.length?Math.max(...rects.map(r=>r.x+r.width))-Math.min(...rects.map(r=>r.x)):0,depth=rects.length?Math.max(...rects.map(r=>r.y+r.depth))-Math.min(...rects.map(r=>r.y)):0;
  $('bulkSize').textContent=`选区 ${width} × ${depth}`;
  const towers=summary.members.filter(m=>!m.production).length,production=summary.members.length-towers;
  $('bulkSummary').textContent=`防御塔 ${towers} · 生产设备 ${production} · 可返还 ${money(summary.credited)} 折金票${summary.credited+1e-8<summary.refund?'（受容量限制）':''}`;
  $('bulkMoveBtn').disabled=ended||busy||!batchSelection.size;$('bulkDeleteBtn').disabled=ended||busy||!batchSelection.size;
  $('bulkClearBtn').textContent=groupMove?'返回选区':'退出批量 · X';
  $('bulkMoveBtn').textContent=groupMove?'移动中…':'整组移动 · M';
  $('bulkReverseBtn').hidden=!boxMode;$('bulkReverseBtn').setAttribute('aria-pressed',String(reverseBox));$('bulkReverseBtn').disabled=busy;
  $('bulkWarning').textContent=production?'拆除返还建造费用，机内物料会清空；防御塔返还投入费用的 50%。':'拆除返还投入费用的 50%，材料和弹药不返还。';
  $('bulkInspector').hidden=batchSelection.size<2;
  const counts=new Map();
  for(const {unit,production} of summary.members){const name=(production?DATA.production.types[unit.type]:game.stats(unit)).name;counts.set(name,(counts.get(name)||0)+1);}
  const stamp=JSON.stringify([...counts]);
  if(stamp!==bulkListStamp){bulkListStamp=stamp;$('bulkItems').replaceChildren();for(const [name,count] of counts){const row=document.createElement('div'),label=document.createElement('span'),n=document.createElement('b');label.textContent=name;n.textContent='×'+count;row.append(label,n);$('bulkItems').append(row);}}
  if(pendingDemolition){const pending=game.bulkSelection(pendingDemolition);$('bulkDeleteCount').textContent=`拆除 ${pendingDemolition.length} 台设备？`;$('bulkDeleteRefund').textContent=`本次可返还 ${money(pending.credited)} 折金票${pending.credited+1e-8<pending.refund?'（受容量限制）':''}。`;$('confirmBulkDelete').disabled=ended||!!pending.error;}
}
function drawBulkTools(){
  if(!batchSelection.size&&!selectionBox)return;
  ctx.save();
  for(const {unit,rect:r} of game.bulkSelection(selectionBox?.dragged?selectionPreview():batchSelection).members){
    const p=screen(r.x,r.y);ctx.fillStyle='#40a8ba16';ctx.strokeStyle='#288896';ctx.lineWidth=1.5;
    ctx.setLineDash(groupMove?[4,4]:[]);ctx.fillRect(p.x,p.y,r.width*view.s,r.depth*view.s);ctx.strokeRect(p.x-1,p.y-1,r.width*view.s+2,r.depth*view.s+2);
  }
  ctx.setLineDash([]);
  const plan=bulkMovePlan();
  if(plan){
    for(const {unit,production,rect:r} of plan.members){
      const at={x:r.x+plan.dx,y:r.y+plan.dy},p=screen(at.x,at.y),w=r.width*view.s,h=r.depth*view.s,def=production?DATA.production.types[unit.type]:game.stats(unit);
      const {img,angle}=production?productionArt(def,unit.dir):{img:images.get(def.easterEgg?'battle_rocket_1':def.id),angle:0};
      ctx.save();ctx.globalAlpha=.65;ctx.translate(p.x+w/2,p.y+h/2);ctx.rotate(angle);if(img)ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();
      ctx.fillStyle=plan.error?'#cc55554a':'#56b0bd32';ctx.strokeStyle=plan.error?'#b14c4c':'#2a8897';ctx.fillRect(p.x,p.y,w,h);ctx.strokeRect(p.x,p.y,w,h);
      if(production)drawProductionPorts({...unit,...at});
    }
    showPlacementHint(hover,plan.error||`${plan.members.length} 台 · 点击确认移动 · Esc 取消`,!!plan.error);
  }
  if(selectionBox){
    const r=selectionRect(),p=screen(r.x,r.y);ctx.fillStyle=selectionBox.remove?'#c97a6820':'#48aeb924';ctx.strokeStyle=selectionBox.remove?'#b26551':'#268391';ctx.setLineDash([5,3]);ctx.fillRect(p.x,p.y,r.width*view.s,r.depth*view.s);ctx.strokeRect(p.x,p.y,r.width*view.s,r.depth*view.s);
  }
  ctx.restore();
}
function setupBulkTools(){
  const inspector=document.createElement('div');inspector.id='bulkInspector';inspector.hidden=true;
  inspector.innerHTML='<h2>批量操作</h2><p>左键点选增减 · 左键框选追加<br>右键框选移除 · 中键拖动画面<br>长按左键 / M 移动 · F 拆除<br>X / Esc 退出批量操作</p><div id="bulkItems"></div>';
  $('inspectorEmpty').before(inspector);
  $('boxSelectBtn').onclick=toggleBoxMode;$('bulkMoveBtn').onclick=()=>beginBulkMove();$('bulkDeleteBtn').onclick=deleteSelection;
  $('bulkClearBtn').onclick=()=>{if(groupMove)cancelBulkMove();else cancel();};
  $('bulkReverseBtn').onclick=()=>{reverseBox=!reverseBox;updateUI();say(reverseBox?'反向框选：拖动可从选区中移除设备。':'正常框选：拖动可向选区追加设备。');};
  $('cancelBulkDelete').onclick=()=>$('bulkDeleteDialog').close();$('closeBulkDelete').onclick=()=>$('bulkDeleteDialog').close();
  $('confirmBulkDelete').onclick=()=>{const ids=pendingDemolition;if(!ids)return;pendingDemolition=null;$('bulkDeleteDialog').close();finishDemolition(ids);};
  $('bulkDeleteDialog').addEventListener('close',()=>{pendingDemolition=null;canvas.focus();});
}
