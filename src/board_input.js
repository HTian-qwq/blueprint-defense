'use strict';
function setupBoardInput(){
  const pointers=new Map();let pinch=null,panMode=false,suppressContextUntil=0;
  const local=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  const cursor=()=>{canvas.style.cursor=selectionBox||beltDraft?'crosshair':[...pointers.values()].some(p=>p.dragged)?'grabbing':panMode?'grab':boxMode||groupMove||choice>=0||movingId!=null?'crosshair':'default';};
  const pair=()=>{const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};};
  function zoom(value,x,y){camera.setZoom(value,x,y);hover=null;syncCamera();}
  const clearHold=active=>{if(active?.holdTimer){clearTimeout(active.holdTimer);active.holdTimer=null;}};
  function stop(){for(const [id,active] of pointers){clearHold(active);if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}pointers.clear();pinch=null;hover=null;beltDraft=null;selectionBox=null;placementAlt=false;cursor();}
  $('zoomIn').onclick=()=>zoom(camera.zoom*1.25);
  $('zoomOut').onclick=()=>zoom(camera.zoom/1.25);
  $('zoomReset').onclick=()=>{camera.reset();hover=null;syncCamera();};
  $('panBtn').onclick=()=>{panMode=!panMode;$('panBtn').setAttribute('aria-pressed',String(panMode));hover=null;cursor();};
  $('selectBtn').onclick=()=>{if(panMode)$('panBtn').click();cancel();stop();say('点击已有设备配置，或从右侧选择设备部署。');};
  canvas.addEventListener('wheel',e=>{
    if(beltDraft||selectionBox)stop();
    e.preventDefault();const p=local(e),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?view.h:1);
    zoom(camera.zoom*Math.exp(-Math.max(-500,Math.min(500,delta))*.0015),p.x,p.y);
  },{passive:false});
  canvas.addEventListener('pointerdown',e=>{
    if(e.button===2)suppressContextUntil=0;
    if(e.button!==0&&e.button!==1&&!(e.button===2&&boxMode&&!panMode))return;e.preventDefault();canvas.focus({preventScroll:true});
    const p=local(e);pointers.set(e.pointerId,{...p,startX:p.x,startY:p.y,startCell:pointer(e),button:e.button,dragged:e.button===1||panMode,panOnly:e.button===1||panMode});
    if(e.button===0&&(e.shiftKey||boxMode&&!panMode)||e.button===2&&boxMode&&!panMode){
      const active=pointers.get(e.pointerId);active.boxCandidate=true;active.dragged=false;active.panOnly=false;beginSelectionBox(pointer(e),e.shiftKey||boxMode,e.button===2||boxMode&&reverseBox);
      if(e.button===0&&boxMode&&!reverseBox&&!e.shiftKey&&batchSelection.size&&e.pointerType!=='touch')active.holdTimer=setTimeout(()=>{
        active.holdTimer=null;if(pointers.size!==1||!pointers.has(e.pointerId)||active.dragged||groupMove||!boxMode||!selectionBox||document.querySelector('dialog[open]')||!['ready','running','paused'].includes(game.phase))return;
        active.boxCandidate=false;active.holdingGroup=true;selectionBox=null;beginBulkMove(active.startCell);cursor();
      },450);
    }else if(e.button===0&&!panMode&&!groupMove&&movingId==null&&productionChoice()&&choiceDef().kind==='belt'){pointers.get(e.pointerId).beltCandidate=true;startBeltDraft(pointer(e));}
    canvas.setPointerCapture(e.pointerId);
    if(pointers.size>=2){for(const pointer of pointers.values()){clearHold(pointer);pointer.dragged=true;}pinch=pair();hover=null;beltDraft=null;selectionBox=null;}
    cursor();
  });
  canvas.addEventListener('pointermove',e=>{
    placementAlt=e.altKey;
    const point=local(e),active=pointers.get(e.pointerId);
    if(!active){hover=panMode?null:pointer(e);cursor();return;}
    const previous={x:active.x,y:active.y};active.x=point.x;active.y=point.y;
    if(Math.hypot(point.x-active.startX,point.y-active.startY)>5)clearHold(active);
    if(pointers.size>=2){
      const next=pair();if(pinch){camera.setZoom(camera.zoom*next.distance/pinch.distance,pinch.x,pinch.y);camera.pan(next.x-pinch.x,next.y-pinch.y);syncCamera();}pinch=next;hover=null;
    }else if(active.holdingGroup){hover=pointer(e);
    }else if(active.boxCandidate){
      if(selectionBox){selectionBox.end=pointer(e);if(Math.hypot(point.x-active.startX,point.y-active.startY)>5)active.dragged=true;selectionBox.dragged=active.dragged;}
    }else if(active.beltCandidate&&beltDraft){
      hover=pointer(e);extendBeltDraft(hover);if(beltDraft.cells.length>1||Math.hypot(point.x-active.startX,point.y-active.startY)>5)active.dragged=true;
    }else{
      let dx=point.x-previous.x,dy=point.y-previous.y;
      if(!active.dragged&&Math.hypot(point.x-active.startX,point.y-active.startY)>5){active.dragged=true;dx=point.x-active.startX;dy=point.y-active.startY;}
      if(active.dragged){camera.pan(dx,dy);hover=null;syncCamera();}else hover=panMode?null:pointer(e);
    }
    cursor();
  });
  function end(e,cancelled){
    const active=pointers.get(e.pointerId);if(!active)return;clearHold(active);pointers.delete(e.pointerId);
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    pinch=pointers.size>=2?pair():null;
    if(active.holdingGroup){if(cancelled&&groupMove)cancelBulkMove();cursor();return;}
    if(active.boxCandidate){
      if(active.button===2)suppressContextUntil=performance.now()+600;
      if(!cancelled&&selectionBox){
        if(active.button===2&&!active.dragged){selectionBox=null;cancel();say('已退出批量操作。');}
        else{selectionBox.end=pointer(e);finishSelectionBox(active.dragged);}
      }else selectionBox=null;
      cursor();return;
    }
    if(active.beltCandidate&&beltDraft){
      const p=local(e),inside=p.x>=0&&p.y>=0&&p.x<view.w&&p.y<view.h;
      if(!cancelled&&inside&&active.dragged)finishBeltDraft();else beltDraft=null;
    }
    if(!cancelled&&!active.dragged&&!active.panOnly){const p=local(e);if(p.x>=0&&p.y>=0&&p.x<view.w&&p.y<view.h)boardClick(e);}
    if(active.dragged||cancelled)hover=null;cursor();
  }
  canvas.addEventListener('pointerup',e=>end(e,false));
  canvas.addEventListener('pointercancel',e=>end(e,true));
  canvas.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId)){clearHold(pointers.get(e.pointerId));pointers.delete(e.pointerId);pinch=null;hover=null;beltDraft=null;selectionBox=null;cursor();}});
  canvas.addEventListener('pointerleave',()=>{hover=null;});
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();if(performance.now()<suppressContextUntil||[...pointers.values()].some(p=>p.button===2))return;stop();if(groupMove)cancelBulkMove();else{cancel();say('已取消选择。');}});
  canvas.addEventListener('auxclick',e=>e.preventDefault());
  window.addEventListener('blur',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  return {stop,setPan(value){panMode=value;$('panBtn').setAttribute('aria-pressed',String(value));cursor();},reset(){stop();panMode=false;$('panBtn').setAttribute('aria-pressed','false');camera.reset();syncCamera();cursor();}};
}
