'use strict';
const hotbarStorageKey='blueprint-defense.hotbar.v1';
let hotbarSlots=[],hotbarButtons=[],hotbarEditSlot=0,hotbarDraft=null,hotbarCards=[];
function hotbarOptions(def){
  if(def.kind==='supply')return [{value:'dp',label:'兑换费用 · 折金票'},{value:'warehouse',label:'材料入库'},{value:'balanced',label:'交替交付 · 费用 / 材料'}];
  if(def.kind==='unloader')return def.sources.map(id=>({value:id,label:DATA.production.items[id].name}));
  if(def.kind==='processor')return DATA.production.recipes.filter(r=>r.machineId===def.id).map(r=>({value:r.id,label:recipeLabel(r)}));
  return [];
}
function hotbarEntry(id,option,dir){
  const def=allDevices.find(d=>d.id===id);if(!def||def.builtIn)return null;
  const options=hotbarOptions(def),production=allDevices.indexOf(def)>=towerCount;
  return {id,option:options.length?(options.some(o=>o.value===option)?option:options[0].value):null,dir:production?(Number.isInteger(dir)&&dir>=0&&dir<4?dir:def.defaultDir??3):0};
}
function defaultHotbar(){return ['icon_belt_grid','unloader_1','furnance_1','storager_1','grinder_1','component_mc_1','battle_turret_1','battle_frost_1','battle_rocket_1'].map(id=>hotbarEntry(id,undefined,3));}
function saveHotbar(){
  let stored=true;try{localStorage.setItem(hotbarStorageKey,JSON.stringify(hotbarSlots));}catch{stored=false;}
  updateHotbar(true);return stored;
}
function currentHotbarEntry(){
  const p=game.production.find(p=>p.id===selected),t=game.towers.find(t=>t.id===selected),def=p?DATA.production.types[p.type]:t?DATA.towers[t.type]:choiceDef();
  return def&&!def.builtIn?hotbarEntry(def.id,p?productionOptionValue(def,p):productionOptions.get(def.id),p?.dir??buildDirection):null;
}
function assignCurrentHotbar(slot){
  const entry=currentHotbarEntry();if(!entry){say('先选择一台机器或炮塔，再按 Shift + 数字保存到快捷栏。',true);return;}
  hotbarSlots[slot]=entry;const stored=saveHotbar();say(`快捷栏 ${slot+1} 已设为${allDevices.find(d=>d.id===entry.id).name}，已记住配方和朝向。${stored?'':'浏览器无法保存配置，本次使用仍有效。'}`);
}
function activateHotbar(slot){
  if(['won','lost'].includes(game.phase))return;
  const entry=hotbarSlots[slot];if(!entry){openHotbar(slot);return;}
  const index=allDevices.findIndex(d=>d.id===entry.id);selectType(index);
  buildDirection=entry.dir;rotationLocked=index>=towerCount;
  if(entry.option)productionOptions.set(entry.id,entry.option);
  invalidatePlacement();updateUI();canvas.focus();
  const def=allDevices[index],error=entry.option?game.productionOptionError(index-towerCount,entry.option):'';
  say(error||`快捷栏 ${slot+1} · ${def.name}${entry.option?' · '+hotbarOptions(def).find(o=>o.value===entry.option).label:''}${index>=towerCount?' · '+directionNames[entry.dir]:''}。${def.kind==='belt'?'拖拽铺设整段。':'点击空地连续放置。'}`,!!error);
}
function updateHotbar(rebuild=false){
  if(!hotbarButtons.length)return;
  hotbarButtons.forEach((button,i)=>{
    const entry=hotbarSlots[i],def=entry&&allDevices.find(d=>d.id===entry.id),option=def&&hotbarOptions(def).find(o=>o.value===entry.option);
    if(rebuild){
      const img=button.querySelector('img');img.hidden=!def;if(def)img.src=devicePortrait(def);else img.removeAttribute('src');
      button.querySelector('.quick-name').textContent=def?.name||'空位';button.querySelector('.quick-config').textContent=option?.label|| (def&&allDevices.indexOf(def)>=towerCount?directionNames[entry.dir]:'');
      button.querySelector('.quick-cost').textContent=def?money(def.cost):'＋';
      button.style.setProperty('--unit-color',def?DATA.deviceArt[def.id]?.color||def.color||'#9daa65':'#858986');
    }
    const index=def?allDevices.indexOf(def):-1,active=!!def&&choice===index&&(!entry.option||productionOptionValue(def)===entry.option);
    const reason=!def?'':index<towerCount?game.constructionError(def):entry.option?game.productionOptionError(index-towerCount,entry.option):'';
    const blocked=!!reason||!!def&&game.dp<def.cost;
    button.classList.toggle('active',active);button.classList.toggle('unavailable',!!blocked);button.setAttribute('aria-pressed',String(active));
    button.title=def?`${i+1} · ${def.name} · ${money(def.cost)} 折金票${option?'\n'+option.label:''}${index>=towerCount?' · '+directionNames[entry.dir]:''}${reason?'\n'+reason:game.dp<def.cost?'\n折金票不足':''}\n右键设置 · Shift + ${i+1} 保存当前设备`:`${i+1} · 空位，点击设置设备`;
    button.setAttribute('aria-label',button.title);
  });
  if(rebuild)deckButtons.forEach((button,index)=>{button.querySelector('.hotkey').textContent=hotbarSlots.flatMap((entry,i)=>entry?.id===allDevices[index].id?[i+1]:[]).join('/');});
}
function openHotbar(slot=0){
  if(game.phase==='running')game.togglePause();sound.stopAll();game.drainAudioEvents();boardInput.reset();updateUI();
  hotbarEditSlot=slot;hotbarDraft=hotbarSlots[slot]?{...hotbarSlots[slot]}:null;$('hotbarSearch').value='';filterHotbar();renderHotbarEditor();$('hotbarDialog').showModal();$('hotbarDialog').querySelector('.dialog-body').scrollTop=0;
}
function filterHotbar(){
  const query=$('hotbarSearch').value.trim().toLowerCase();let count=0;
  for(const {button,def} of hotbarCards){button.hidden=!`${def.name} ${def.role} ${hotbarOptions(def).map(o=>o.label).join(' ')}`.toLowerCase().includes(query);if(!button.hidden)count++;}
  $('hotbarNoResults').hidden=count>0;
}
function renderHotbarEditor(){
  $('hotbarEditTitle').textContent=`设置快捷栏 ${hotbarEditSlot+1}`;
  document.querySelectorAll('[data-edit-slot]').forEach((button,i)=>{button.setAttribute('aria-pressed',String(i===hotbarEditSlot));const entry=hotbarSlots[i];button.title=entry?allDevices.find(d=>d.id===entry.id).name:'空位';});
  const def=hotbarDraft&&allDevices.find(d=>d.id===hotbarDraft.id),options=def?hotbarOptions(def):[];
  for(const {button,def:d} of hotbarCards)button.setAttribute('aria-pressed',String(d.id===def?.id));
  $('hotbarConfig').hidden=!def;$('hotbarSave').disabled=!def;$('hotbarUseCurrent').disabled=!currentHotbarEntry();
  if(!def)return;
  $('hotbarDeviceName').textContent=def.name;$('hotbarDeviceImage').src=devicePortrait(def);
  $('hotbarOptionRow').hidden=!options.length;const select=$('hotbarOption');select.replaceChildren();
  for(const o of options){const option=document.createElement('option');option.value=o.value;option.textContent=o.label;select.append(option);}select.value=hotbarDraft.option;
  $('hotbarDirectionRow').hidden=allDevices.indexOf(def)<towerCount;$('hotbarDirection').value=hotbarDraft.dir;
  const error=hotbarDraft.option?game.productionOptionError(allDevices.indexOf(def)-towerCount,hotbarDraft.option):allDevices.indexOf(def)<towerCount?game.constructionError(def):'';
  $('hotbarConfigHint').textContent=error?error+'。可以先保存配置，满足条件后再部署。':'配置只影响从此格选出的新设备；配方和朝向会一起保存。';
}
function setupHotbar(){
  hotbarSlots=defaultHotbar();try{const saved=JSON.parse(localStorage.getItem(hotbarStorageKey));if(Array.isArray(saved)&&saved.length===9)hotbarSlots=saved.map(entry=>entry&&typeof entry==='object'?hotbarEntry(entry.id,entry.option,entry.dir):null);}catch{}
  for(let i=0;i<9;i++){
    const button=document.createElement('button');button.className='quick-slot';button.dataset.hotbarSlot=i;button.innerHTML=`<kbd>${i+1}</kbd><img alt=""><span class="quick-cost"></span><span class="quick-name"></span><span class="quick-config"></span>`;
    button.onclick=()=>activateHotbar(i);button.oncontextmenu=e=>{e.preventDefault();openHotbar(i);};$('hotbarSlots').append(button);hotbarButtons.push(button);
    const edit=document.createElement('button');edit.textContent=i+1;edit.dataset.editSlot=i;edit.onclick=()=>{hotbarEditSlot=i;hotbarDraft=hotbarSlots[i]?{...hotbarSlots[i]}:null;renderHotbarEditor();};$('hotbarEditSlots').append(edit);
  }
  for(const def of allDevices.filter(d=>!d.builtIn)){
    const button=document.createElement('button');button.className='hotbar-device';button.dataset.hotbarDevice=def.id;
    const img=document.createElement('img');img.src=devicePortrait(def);img.alt='';const text=document.createElement('span');text.textContent=def.name;button.append(img,text);
    button.onclick=()=>{hotbarDraft=hotbarEntry(def.id,productionOptions.get(def.id),3);renderHotbarEditor();};$('hotbarDevices').append(button);hotbarCards.push({button,def});
  }
  $('hotbarSettings').onclick=()=>openHotbar();$('closeHotbar').onclick=()=>$('hotbarDialog').close();
  $('hotbarDialog').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();$('hotbarDialog').close();}});
  $('hotbarDialog').addEventListener('close',()=>canvas.focus());$('hotbarSearch').oninput=filterHotbar;
  $('hotbarOption').onchange=()=>{hotbarDraft.option=$('hotbarOption').value;renderHotbarEditor();};$('hotbarDirection').onchange=()=>{hotbarDraft.dir=Number($('hotbarDirection').value);renderHotbarEditor();};
  $('hotbarUseCurrent').onclick=()=>{hotbarDraft=currentHotbarEntry();renderHotbarEditor();};
  $('hotbarSave').onclick=()=>{if(!hotbarDraft)return;hotbarSlots[hotbarEditSlot]={...hotbarDraft};const stored=saveHotbar();$('hotbarDialog').close();say(`快捷栏 ${hotbarEditSlot+1} 已保存。${stored?'下次打开仍会保留。':'浏览器无法保存配置，本次使用仍有效。'}`);};
  $('hotbarClear').onclick=()=>{hotbarSlots[hotbarEditSlot]=null;saveHotbar();$('hotbarDialog').close();say(`快捷栏 ${hotbarEditSlot+1} 已清空，点击空位可重新设置。`);};
  $('hotbarDefaults').onclick=()=>{hotbarSlots=defaultHotbar();saveHotbar();hotbarDraft={...hotbarSlots[hotbarEditSlot]};renderHotbarEditor();say('快捷栏已恢复默认设备。');};
  updateHotbar(true);
}
