'use strict';
const productionOptions=new Map();
let coreControls=null;
function corePortLabel(port){
  const core=DATA.map.core,offset=port.y-core.y;
  return (port.side===2?'左':'右')+'侧'+(offset<3?'上':offset>5?'下':'中')+' · 出口 '+(port.index+1);
}
function updateCoreInspector(active,ended){
  $('coreConfig').hidden=!active;if(!active)return;
  if(!coreControls){
    coreControls=new Map();
    const ports=game.corePorts.filter(p=>p.corePort==='outputs').sort((a,b)=>b.side-a.side||a.y-b.y);
    for(const port of ports){
      const row=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select'),status=document.createElement('small');
      row.className='core-port-row';select.id=port.id;label.htmlFor=select.id;label.textContent=corePortLabel(port);
      select.add(new Option('关闭出口',''));
      for(const id of DATA.production.types[port.type].sources)select.add(new Option(DATA.production.items[id].name,id));
      select.onchange=()=>{const error=game.setProductionOption(port.id,select.value);say(error||`${corePortLabel(port)}：${select.value?DATA.production.items[select.value].name:'已关闭'}`,!!error);updateUI();};
      row.append(label,select,status);$('coreOutputList').append(row);coreControls.set(port.id,{select,status});
    }
  }
  for(const port of game.corePorts.filter(p=>p.corePort==='outputs')){
    const {select,status}=coreControls.get(port.id);select.value=port.source;select.disabled=ended;
    for(const option of select.options){if(!option.value)continue;const lock=game.productionItemLock(option.value),item=DATA.production.items[option.value];option.disabled=!!lock;option.textContent=item.name+(lock?' · '+game.productionLockText(lock):game.isRawMaterial(item.id)?' · ∞':' · 库存 '+game.warehouseCount(item.id));}
    status.textContent=game.productionStatus(port);
  }
  $('coreInputState').textContent=`上下入口自动入库 · 已接收 ${game.corePorts.filter(p=>p.corePort==='inputs').reduce((n,p)=>n+p.delivered,0)} 件`;
}
function drawCorePorts(){
  for(const port of game.corePorts){
    drawProductionPorts(port);
    if(port.corePort!=='outputs')continue;
    const p=screen(port.x+.5,port.y+.5),s=view.s,icon=images.get(port.cargo?.kind||port.source);
    if(icon){circle(p.x,p.y,s*.31,'#e5e4e4');ctx.drawImage(icon,p.x-s*.3,p.y-s*.3,s*.6,s*.6);}
    if(selected==='protocol-core'){ctx.fillStyle='#276f78';ctx.font=`bold ${Math.max(9,s*.3)}px "HarmonyOS Sans SC", sans-serif`;ctx.textAlign='center';ctx.fillText(String(port.index+1),p.x,p.y-s*.33);}
  }
}
function recipeLabel(recipe){return game.recipeInputs(recipe).map(x=>`${DATA.production.items[x.id].name} ×${x.count}`).join(' + ')+` → ${DATA.production.items[recipe.output].name} ×${recipe.outputCount}`;}
function productionOptionValue(def,unit){return unit?(def.kind==='supply'?unit.deliveryMode:unit.source||unit.recipe):productionOptions.get(def.id)||(def.kind==='supply'?'dp':def.sources?.[0]||DATA.production.recipes.find(r=>r.machineId===def.id)?.id);}
function rotateProductionSelection(){
  if(groupMove||batchSelection.size>1){say('整组移动保持各设备朝向；需要转向时请单独选中设备。');return;}
  if(!['ready','running','paused'].includes(game.phase))return;
  if(productionChoice()||movingId!=null&&activeBuild()?.production){buildDirection=((placementPlan()?.dir??buildDirection)+1)%4;rotationLocked=true;invalidatePlacement();if(beltDraft)extendBeltDraft(beltDraft.cells.at(-1));say('已锁定朝向 '+directionNames[buildDirection]+'，点击空地放置。');}
  else{const p=game.production.find(p=>p.id===selected);if(!p)return;if(!game.rotateProduction(p.id)){say(game.productionPlacementError(p.type,p.x,p.y,(p.dir+1)%4,p.id),true);return;}say('设备朝向 '+directionNames[p.dir]+'。');}
  updateUI();
}
function drawOutput(x,y,dir){
  const {s}=view,p=screen(x+.5,y+.5);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(dir*Math.PI/2);
  ctx.fillStyle='#387d83';ctx.beginPath();ctx.moveTo(s*.47,0);ctx.lineTo(s*.28,-s*.12);ctx.lineTo(s*.28,s*.12);ctx.closePath();ctx.fill();ctx.restore();
}
function productionArt(def,dir){return {img:images.get(def.faces?def.id+'@'+dir:def.id),angle:def.kind==='belt'?dir*Math.PI/2:0};}
function drawProductionPorts(unit){
  const {s}=view;
  for(const port of game.productionPortCells(unit,'outputs'))drawOutput(port.x,port.y,port.side);
  if(DATA.production.types[unit.type].kind==='belt')return;
  for(const port of game.productionPortCells(unit,'inputs')){const p=screen(port.x+.5,port.y+.5);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(port.side*Math.PI/2);ctx.beginPath();ctx.moveTo(s*.27,0);ctx.lineTo(s*.44,-s*.09);ctx.lineTo(s*.44,s*.09);ctx.closePath();ctx.fillStyle='#f4faf5';ctx.fill();ctx.strokeStyle='#387d83';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();}
}
function drawProduction(unit,online){
  const d=DATA.production.types[unit.type],p=screen(unit.x,unit.y),s=view.s,f=game.productionRect(unit),w=f.width*s,h=f.depth*s;
  let {img,angle}=productionArt(d,unit.dir);
  if(d.kind==='belt'){
    const upstream=game.productionNodes().filter(other=>other!==unit&&game.productionPortMatches(other,unit)),dir=[[1,0],[0,1],[-1,0],[0,-1]][unit.dir];
    if(upstream.length===1){const before=game.productionPortCells(upstream[0],'outputs').find(c=>Math.abs(c.x-unit.x)+Math.abs(c.y-unit.y)===1),after={x:unit.x+dir[0],y:unit.y+dir[1]};if(before&&(before.x!==after.x||before.y!==after.y)){const tile=BlueprintTD.beltTiles([before,unit,after])[1];img=images.get(tile.sprite);angle=tile.angle*Math.PI/180;}}
  }
  ctx.save();ctx.fillStyle='#e0e1df';ctx.fillRect(p.x+1,p.y+1,w-2,h-2);
  ctx.save();ctx.translate(p.x+w/2,p.y+h/2);ctx.rotate(angle);if(img)ctx.drawImage(img,-w/2+1,-h/2+1,w-2,h-2);ctx.restore();
  // Teal boundary and output arrows distinguish supply belts from the enemy road.
  ctx.strokeStyle=d.kind==='belt'?'#65a7a0':'#8c918c';ctx.lineWidth=1;ctx.strokeRect(p.x+1,p.y+1,w-2,h-2);
  drawProductionPorts(unit);
  if(d.category==='warehouse'){
    const connected=online.has(unit.id);circle(p.x+s*.14,p.y+s*.14,s*.075,connected?'#4f946c':'#c16d46');
    const dock=game.productionPorts(unit).warehouse;
    if(dock!=null){const [dx,dy]=[[1,0],[0,1],[-1,0],[0,-1]][dock],cx=p.x+w/2+dx*w/2,cy=p.y+h/2+dy*h/2;strokeLine(cx-dx*s*.2,cy-dy*s*.2,cx+dx*s*.15,cy+dy*s*.15,connected?'#579879':'#b88462',3);}
  }
  const item=unit.cargo?.kind||(d.kind==='unloader'?unit.source:game.productionRecipe(unit)?.output),icon=images.get(item);
  if(icon){
    let x=p.x+w*.5,y=p.y+h*.5;
    if(d.kind==='belt'&&unit.cargo){const next=game.productionOutput(unit),f=next&&!next.cargo&&game.productionAccepts(next,item,unit)?Math.min(.23,unit.cargo.age/d.period*.23):0,dir=[[1,0],[0,1],[-1,0],[0,-1]][unit.dir];x+=dir[0]*f*s;y+=dir[1]*f*s;}
    circle(x,y,s*.23,unit.cargo?'#e4f1e5':'#dde5dda8');ctx.globalAlpha=unit.cargo?1:.65;ctx.drawImage(icon,x-s*.22,y-s*.22,s*.44,s*.44);ctx.globalAlpha=1;
  }
  const recipe=game.productionRecipe(unit),work=d.kind==='unloader'?unit.work/d.period:unit.processingIngredients?unit.work/recipe.period:d.kind==='processor'&&unit.cargo?.kind===recipe?.input?unit.cargo.age/recipe.period:0;
  ctx.fillStyle='#528a6c';ctx.fillRect(p.x+w*.12,p.y+h*.9,w*.76*Math.min(1,work),2);
  const status=game.productionStatus(unit,online);
  if(/未解锁|需要研究|等待配料|不匹配|未贴靠|未连接|不接收|积压|已满/.test(status)){circle(p.x+s*.14,p.y+s*.14,s*.095,'#cb914f');ctx.fillStyle='#fff';ctx.font=`bold ${Math.max(6,s*.14)}px "HarmonyOS Sans SC", sans-serif`;ctx.textAlign='center';ctx.fillText('!',p.x+s*.14,p.y+s*.19);}
  if(unit.id===selected){ctx.strokeStyle='#489da9';ctx.lineWidth=2;ctx.strokeRect(p.x-2,p.y-2,w+4,h+4);}
  ctx.restore();
}
let productionInspectorKey='';
let warehouseCells=null;
function updateProductionUnlock(){
  const rule=DATA.production.unlocks[0],locked=!!game.productionItemLock(rule.items[0]),panel=$('productionUnlock');
  const title=locked?`${rule.name}待解锁 · 研究「${game.researchNode(rule.research).name}」`:`${rule.name}已解锁 · 无限供应`;
  if(panel.firstElementChild.textContent!==title)panel.firstElementChild.textContent=title;
  panel.classList.toggle('unlocked',!locked);
  const prices=`蓝铁块 ${money(DATA.production.items.item_iron_nugget.value)} 折金票 / 份 · 铁制零件 ${money(DATA.production.items.item_iron_cmpt.value)} 折金票 / 份`;
  if(panel.lastElementChild.textContent!==prices)panel.lastElementChild.textContent=prices;
}
function updateWarehouseInventory(visible){
  $('warehousePanel').hidden=!visible;if(!visible)return;
  if(!warehouseCells){warehouseCells=new Map();for(const item of Object.values(DATA.production.items)){const row=document.createElement('div'),img=document.createElement('img'),count=document.createElement('b');img.src=item.image;img.alt=item.name;row.title=item.name+(game.isRawMaterial(item.id)?' · 无限供应':' · 实际成品库存');row.append(img,count);$('warehouseItems').append(row);warehouseCells.set(item.id,count);}}
  for(const [id,count] of warehouseCells){const lock=game.productionItemLock(id);count.textContent=lock?'未解锁':game.isRawMaterial(id)?'∞':game.warehouseCount(id);count.parentElement.classList.toggle('locked',!!lock);count.parentElement.title=DATA.production.items[id].name+' · '+(lock?game.productionLockText(lock):game.isRawMaterial(id)?'无限供应':game.warehouseCount(id)+' 库存');}
}
function updateProductionInspector(def,unit,ended){
  const value=productionOptionValue(def,unit),recipe=DATA.production.recipes.find(r=>r.id===value),dir=unit?.id===movingId?buildDirection:unit?.dir??buildDirection;
  const footprint=game.productionFootprint(DATA.production.types.indexOf(def),dir);$('detailRole').textContent=def.role+` · ${footprint.width}×${footprint.depth}`;
  $('selectionTag').textContent=unit?.fixed?'仓库 · 自带设施':unit?'产线 · 已部署':'产线 · 等待部署';
  $('detailDamage').previousElementSibling.textContent='建造 折金票';$('detailDamage').textContent=money(def.cost);
  const sides=['右','下','左','上'],ports=game.productionPorts(unit?{...unit,dir}:{type:DATA.production.types.indexOf(def),dir});
  $('detailImage').src=devicePortrait(def);
  const connections=def.kind==='unloader'?['接仓 / 出料',[ports.warehouse,ports.outputs[0]]]:def.kind==='loader'?['进料 / 接仓',[ports.inputs[0],ports.warehouse]]:def.kind==='processor'?['入口 / 出口',[ports.inputs[0],ports.outputs[0]]]:def.kind==='supply'?['入口',ports.inputs]:def.kind==='belt'?['出口',ports.outputs]:['接入',[]];
  $('detailRange').previousElementSibling.textContent=connections[0];$('detailRange').textContent=connections[1].map(side=>sides[side]).join(' / ')||'固定';
  $('detailInterval').previousElementSibling.textContent='周期';$('detailInterval').textContent=(recipe?.period??def.period)==null?'—':(recipe?.period??def.period)+'s';
  $('rotateBtn').textContent=`旋转设备 · ${directionNames[dir]} · R`;$('rotateBtn').disabled=ended;
  $('towerActions').hidden=!unit||!!unit.fixed;$('rotateBtn').hidden=!!unit?.fixed;$('placementHint').hidden=!!unit&&!unit.fixed;$('placementHint').textContent=unit?.fixed?'地图底部自带的一整排仓库存取线，不消耗折金票，不可拆除。存取口放在上方一格，仓库接口必须朝下。':`占地 ${footprint.width}×${footprint.depth}，点击位置为左上角。按 R 旋转。空心箭头为入口，实心箭头为出口，接错方向会停料。拆除全额返还 ${money(def.cost)} 折金票，设备内物料会清空。`;
  if(!unit&&def.kind==='belt')$('placementHint').textContent='按住拖拽铺设整段，松开确认；原路回拖可缩短。转弯自动处理，R 锁定末端朝向。红色表示无法整段放置，Esc 取消。中键或「拖动」模式仍可平移画面。';
  if(unit){$('withdrawBtn').textContent=`拆除机械 · 返还 ${money(def.cost)} 折金票`;$('withdrawBtn').disabled=ended;$('towerRecord').textContent=def.kind==='supply'?`已交付 ${unit.delivered} 份 · 产线累计供应 ${money(game.productionEarned)} 折金票`:'按实际接口连接 · 拆除会清空机内物料';}
  const configurable=['unloader','processor','supply'].includes(def.kind),select=$('productionOption');
  select.hidden=!configurable;$('productionOptionLabel').hidden=!configurable;select.disabled=ended;
  $('productionOptionHint').hidden=!configurable;$('productionOptionHint').textContent=unit?'只修改这台设备；切换时机内物料退回仓库，重新计时。':'先选物品或配方，再点击空地放置。点击已有设备可单独修改。';
  if(def.kind==='supply')$('productionOptionHint').textContent='交替模式逐份轮换折金票和材料；折金票满时自动入库。入库不会同时获得折金票。切换模式保留箱内物品。';
  const key=[def.id,unit?.id,value].join(':');
  if(key!==productionInspectorKey){
    productionInspectorKey=key;select.replaceChildren();$('recipePreview').replaceChildren();
    if(configurable){
      $('productionOptionLabel').textContent=def.kind==='supply'?'交付方式':def.kind==='unloader'?'取货物品':'加工配方';
      const options=def.kind==='supply'?[{value:'dp',label:'兑换费用 · 折金票'},{value:'warehouse',label:'材料入库 · 研究 / 制造 / 弹药'},{value:'balanced',label:'交替交付 · 费用 / 材料'}]:def.kind==='unloader'?def.sources.map(id=>({value:id,label:DATA.production.items[id].name})):DATA.production.recipes.filter(r=>r.machineId===def.id).map(r=>({value:r.id,label:recipeLabel(r)}));
      for(const o of options){const option=document.createElement('option');option.value=o.value;option.textContent=o.label;select.append(option);}
    }
    const itemCell=(id,count=1)=>{const d=DATA.production.items[id],span=document.createElement('span'),img=document.createElement('img'),text=document.createElement('small');img.src=d.image;img.alt=d.name;text.textContent=d.name+' ×'+count;span.append(img,text);return span;};
    const preview=$('recipePreview');
    if(recipe){for(const [i,x] of game.recipeInputs(recipe).entries()){if(i){const plus=document.createElement('b');plus.textContent='+';preview.append(plus);}preview.append(itemCell(x.id,x.count));}const arrow=document.createElement('b');arrow.textContent=`${recipe.period}s →`;preview.append(arrow,itemCell(recipe.output,recipe.outputCount));}
    else if(def.kind==='unloader')preview.append(itemCell(value));
    else if(def.kind==='supply'){const text=document.createElement('small');text.textContent=Object.values(DATA.production.items).filter(item=>item.value>0).map(item=>`${item.name} → ${money(item.value)} 折金票`).join('\n');preview.append(text);}
  }
  if(configurable)select.value=value;
  if(configurable&&def.kind!=='supply')for(const option of select.options){
    const r=DATA.production.recipes.find(r=>r.id===option.value),lock=def.kind==='unloader'?game.productionItemLock(option.value):game.productionRecipeLock(r);
    const label=def.kind==='unloader'?DATA.production.items[option.value].name:recipeLabel(r);
    const detail=lock?game.productionLockText(lock):def.kind==='unloader'?(game.isRawMaterial(option.value)?'∞ 无限':game.warehouseCount(option.value)+' 库存'):`${r.period}s · ${money(DATA.production.items[r.output].value)} 折金票`;
    option.disabled=!!lock;option.textContent=label+' · '+detail;
  }
  const previewLock=def.kind==='unloader'?game.productionItemLock(value):game.productionRecipeLock(recipe);
  $('productionState').textContent=unit?`${game.productionStatus(unit)}${unit.cargo?' · '+DATA.production.items[unit.cargo.kind].name:''}${game.phase==='paused'?' · 已暂停':''}`:previewLock?game.productionLockText(previewLock):'部署后可查看生产状态';
  if(recipe&&game.batchRecipe(recipe)){
    $('productionOptionHint').textContent='各入口可分别接入配方原料，也可用仓库取货口输出已有成品。备齐整批后开工；每种原料最多预存一批。';
    if(unit){const held=unit.processingIngredients||unit.buffer||{};$('productionState').textContent+='\n'+game.recipeInputs(recipe).map(x=>`${DATA.production.items[x.id].name} ${held[x.id]||0} / ${x.count}`).join(' · ');}
  }
}
