'use strict';
function setupSessionUI(){
  const api=BlueprintSession,store=new BlueprintLocalStore(),rulesId=BlueprintBuild.rulesId;
  const slots={},menu=$('mainMenu');let active=false,lastSave=0,savedClock=0,layoutDocument=null,pendingConfirmation=null,chosenSlot=null,hasStoredRecord=false;
  const mode=()=>game.config.practiceResources?'boss':'campaign';
  const label=scenario=>scenario==='boss'?'罗丹挑战':'全线防守';
  const message=(text,error=false)=>{$('storageStatus').textContent=text;$('storageStatus').classList.toggle('error',error);};
  const view=()=>({zoom:camera.zoom,cx:camera.cx,cy:camera.cy,speed});
  function current(){const doc=api.capture(game,rulesId,view());doc.savedAt=Math.max(Date.now(),savedClock+1);savedClock=doc.savedAt;return doc;}
  function summary(){
    const available=Object.values(slots).filter(Boolean).sort((a,b)=>b.savedAt-a.savedAt),latest=slots[chosenSlot]||available[0];
    $('savedSlot').hidden=available.length<2;if(latest){chosenSlot=latest.scenario;$('savedSlot').value=chosenSlot;}
    $('menuContinue').disabled=!active&&!latest;$('menuExport').disabled=!active&&!latest;
    $('menuReturn').hidden=!active;
    $('menuContinue').textContent=active&&chosenSlot===mode()?'返回当前演练':'继续演练';
    $('saveSummary').textContent=latest?`${label(latest.scenario)} · 第 ${Math.max(1,latest.state.wave+1)} 波 · 核心 ${latest.state.life} / 10\n${new Date(latest.savedAt).toLocaleString()}`:'还没有存档，从新战役开始。';
    return latest;
  }
  function persist(emergency=false){
    if(!active)return Promise.resolve();
    const document=current();slots[document.scenario]=document;
    if(emergency){store.emergency(document.scenario,document);return Promise.resolve();}
    return store.write(document.scenario,document).then(()=>{
      $('saveIndicator').textContent='已保存 '+new Date(document.savedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
      $('saveIndicator').title=store.error||'本局进度保存在此浏览器';message(store.error||'本局进度已保存');summary();
    }).catch(()=>{$('saveIndicator').textContent='未能保存';message('无法保存到浏览器，请导出存档备份。',true);});
  }
  function pause(){if(game.phase==='running')game.togglePause();boardInput.stop();sound.stopAll();game.drainAudioEvents();accumulator=0;updateUI();}
  function closeMenu(){menu.close();resize();canvas.focus();}
  async function openMenu(){pause();if(active){chosenSlot=mode();await persist();}summary();menu.showModal();}
  function confirmAction(text,action){pendingConfirmation=action;$('sessionConfirmText').textContent=text;$('sessionConfirm').showModal();}
  $('sessionConfirmCancel').onclick=()=>{$('sessionConfirm').close();pendingConfirmation=null;$('scenario').value=mode();};
  $('sessionConfirm').addEventListener('cancel',()=>{pendingConfirmation=null;$('scenario').value=mode();});
  $('sessionConfirmOK').onclick=()=>{const action=pendingConfirmation;pendingConfirmation=null;$('sessionConfirm').close();if(action)action();};
  function syncScenario(){const scenario=mode();$('scenario').value=scenario;$('scenarioHint').textContent=scenario==='boss'?'全科技 · 成品各 60 · 第二波罗丹':'第 10 波迎战罗丹';lastWavePanel='';}
  function install(restored){
    pause();api.apply(game,restored.game);active=true;chosenSlot=mode();syncScenario();productionOptions.clear();cancel();
    const v=restored.view||{};camera.reset();
    if([v.zoom,v.cx,v.cy].every(Number.isFinite)){camera.zoom=Math.max(camera.min,Math.min(camera.max,v.zoom));camera.cx=Math.max(0,Math.min(DATA.map.width,v.cx));camera.cy=Math.max(0,Math.min(DATA.map.height,v.cy));camera.layout();}
    speed=v.speed===2?2:1;$('speedBtn').textContent=speed+'×';accumulator=0;last=0;syncCamera();updateUI();
    if(menu.open)closeMenu();void persist();say(game.phase==='paused'?'存档已恢复，点击继续推进演练。':'存档已恢复。');
  }
  async function newGame(scenario){
    pause();if(active)await persist();
    const start=()=>{game.config=api.scenarioConfig(DATA,scenario);active=true;chosenSlot=scenario;syncScenario();reset();camera.reset();syncCamera();if(menu.open)closeMenu();void persist();};
    if(slots[scenario])confirmAction(`开始新的${label(scenario)}将覆盖该模式的本地存档。需要保留时，请先导出备份。`,start);else start();
  }
  function download(record,prefix){
    const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=prefix+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function readFile(input){const file=input.files[0];input.value='';if(!file)return null;if(file.size>10*1024*1024)throw Error('文件超过 10 MB');return JSON.parse(await file.text());}
  $('sessionBtn').onclick=()=>void openMenu();$('menuReturn').onclick=closeMenu;
  menu.addEventListener('cancel',event=>{if(!active)event.preventDefault();});
  $('menuNew').onclick=()=>void newGame('campaign');$('menuPractice').onclick=()=>void newGame('boss');
  $('savedSlot').onchange=()=>{chosenSlot=$('savedSlot').value;summary();};
  $('menuContinue').onclick=()=>{if(active&&chosenSlot===mode()){closeMenu();return;}const latest=summary();if(!latest)return;try{install(api.restore(latest,DATA,BlueprintTD.Game,rulesId));}catch(error){message(error.message,true);}};
  $('menuExport').onclick=()=>{try{const doc=active&&chosenSlot===mode()?current():summary();if(doc){download(doc,'blueprint-defense-save');message('存档已导出。');}}catch(error){message(error.message,true);}};
  $('menuImport').onclick=()=>$('saveFile').click();
  $('saveFile').onchange=async()=>{try{
    const doc=await readFile($('saveFile'));if(!doc)return;
    const restored=api.restore(doc,DATA,BlueprintTD.Game,rulesId);
    confirmAction(`导入${label(doc.scenario)}存档：第 ${Math.max(1,doc.state.wave+1)} 波。确认后将替换该模式的本地进度。`,()=>install(restored));
  }catch(error){message('导入失败：'+error.message,true);}};
  $('menuHelp').onclick=()=>$('help').showModal();
  function settings(){const percent=Math.round(sound.volume*100);$('settingsVolume').value=percent;$('settingsVolumeValue').textContent=percent+'%';$('settingsMute').textContent=sound.muted?'开启音效':'静音';}
  $('menuSettings').onclick=()=>{settings();$('sessionSettings').showModal();};$('settingsClose').onclick=()=>$('sessionSettings').close();
  $('settingsVolume').oninput=e=>{sound.setVolume(Number(e.target.value)/100);if(sound.volume>0){sound.setMuted(false);void sound.unlock();}settings();};
  $('settingsMute').onclick=()=>{sound.setMuted(!sound.muted);if(!sound.muted)void sound.unlock();settings();};
  if(BlueprintBuild.web){$('resetBtn').onclick=()=>void newGame(mode());$('againBtn').onclick=()=>void newGame(mode());$('scenario').onchange=()=>void newGame($('scenario').value);}
  $('blueprintsBtn').onclick=()=>{pause();$('layoutExportSelection').disabled=!batchSelection.size;$('blueprintDialog').showModal();};
  $('blueprintClose').onclick=()=>$('blueprintDialog').close();
  function exportLayout(selected){try{download(api.layout(game,selected),'blueprint-layout');$('layoutStatus').textContent='布局文件已导出。';}catch(error){$('layoutStatus').textContent=error.message;}}
  $('layoutExportAll').onclick=()=>exportLayout();$('layoutExportSelection').onclick=()=>exportLayout([...batchSelection]);
  $('layoutImport').onclick=()=>$('layoutFile').click();
  function preview(){
    $('layoutPlace').disabled=true;$('layoutCost').textContent='';$('layoutError').textContent='';if(!layoutDocument)return null;
    try{const plan=api.planLayout(game,layoutDocument,Number($('layoutX').value),Number($('layoutY').value),BlueprintTD.Game,rulesId);
      $('layoutCost').textContent=`${plan.count} 台设备 · ${money(plan.cost)} 折金票${Object.keys(plan.materials).length?' · '+game.materialText(plan.materials):''}`;$('layoutPlace').disabled=false;return plan;
    }catch(error){$('layoutError').textContent=error.message;return null;}
  }
  $('layoutFile').onchange=async()=>{try{
    const doc=await readFile($('layoutFile'));if(!doc)return;api.parse(doc,api.LAYOUT);layoutDocument=doc;
    $('layoutName').textContent=String(doc.name||'蓝图布局').slice(0,80);$('layoutX').value=Number.isInteger(doc.origin?.x)?doc.origin.x:0;$('layoutY').value=Number.isInteger(doc.origin?.y)?doc.origin.y:0;$('layoutPreview').hidden=false;$('layoutStatus').textContent='';preview();
  }catch(error){layoutDocument=null;$('layoutPreview').hidden=true;$('layoutStatus').textContent='导入失败：'+error.message;}};
  $('layoutX').oninput=preview;$('layoutY').oninput=preview;
  $('layoutPlace').onclick=()=>{const plan=preview();if(!plan)return;api.apply(game,plan.game);cancel();updateUI();$('blueprintDialog').close();layoutDocument=null;$('layoutPreview').hidden=true;void persist();say(`已放置 ${plan.count} 台设备，花费 ${money(plan.cost)} 折金票。`);};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active){pause();void persist(true);void persist();}});
  window.addEventListener('pagehide',()=>{if(active)void persist(true);});
  const ready=Promise.all(['campaign','boss'].map(async scenario=>{
    const doc=await store.read(scenario);if(!doc)return;hasStoredRecord=true;try{api.restore(doc,DATA,BlueprintTD.Game,rulesId);slots[scenario]=doc;savedClock=Math.max(savedClock,doc.savedAt);}catch(error){message(`${label(scenario)}存档无法读取：${error.message}`,true);}
  })).then(()=>{active=!BlueprintBuild.web&&!hasStoredRecord;summary();if(store.error)message(store.error,true);$('menuCover').src=DATA.map.core.image;if(BlueprintBuild.web||hasStoredRecord)menu.showModal();});
  return {ready,open:openMenu,save:()=>persist(),capture:current,tick(timestamp){if(active&&timestamp-lastSave>10000){lastSave=timestamp;void persist();}},get active(){return active;}};
}
