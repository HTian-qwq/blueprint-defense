'use strict';
const researchCards=new Map();
let researchTab='production';
function selectResearchTab(tab){
  researchTab=tab;
  for(const el of document.querySelectorAll('[data-research-tab]'))el.setAttribute('aria-pressed',String(el.dataset.researchTab===tab));
  for(const el of document.querySelectorAll('.tech-branch'))el.hidden=el.dataset.category!==tab;
}
function setupEconomyUI(){
  $('techBtn').onclick=()=>{if(game.phase==='running')game.togglePause();sound.stopAll();game.drainAudioEvents();updateUI();$('techDialog').showModal();$('techDialog').querySelector('.dialog-body').scrollTop=0;};
  $('techShortcut').onclick=()=>$('techBtn').click();
  $('closeTech').onclick=()=>$('techDialog').close();
  for(const button of document.querySelectorAll('[data-research-tab]')){
    button.querySelector('small').textContent=String(DATA.economy.nodes.filter(n=>!!n.production===(button.dataset.researchTab==='production')).length).padStart(2,'0');
    button.onclick=()=>selectResearchTab(button.dataset.researchTab);
  }
  for(const branch of [...new Set(DATA.economy.nodes.map(n=>n.branch))]){
    const column=document.createElement('section');column.className='tech-branch';column.dataset.category=DATA.economy.nodes.find(n=>n.branch===branch).production?'production':'combat';
    const heading=document.createElement('h3');heading.textContent=branch+'路线';column.append(heading);
    for(const n of DATA.economy.nodes.filter(n=>n.branch===branch)){
      const card=document.createElement('article');card.className='tech-node';card.dataset.research=n.id;
      const title=document.createElement('h4');title.textContent=n.name;
      const parent=document.createElement('small');parent.className='tech-parent';parent.textContent=n.requires.length?'↑ '+n.requires.map(id=>game.researchNode(id).name).join(' + '):'基础研究';
      const description=document.createElement('p');description.textContent=n.desc;
      const cost=document.createElement('div');cost.className='tech-cost';cost.textContent=`${money(n.cost)} 折金票 · ${n.seconds} 秒\n${game.materialText(n.materials)}`;
      const state=document.createElement('small');state.className='tech-state';
      const progress=document.createElement('progress');progress.max=n.seconds;progress.value=0;progress.setAttribute('aria-label',n.name+'研究进度');
      const products=document.createElement('div');products.className='tech-products';
      for(const id of n.products||[]){const item=DATA.production.items[id],img=document.createElement('img');img.src=item.image;img.alt=item.name;img.title=item.name;products.append(img);}
      if(n.machine){const button=document.createElement('button');button.className='tech-machine';button.textContent='查看'+allDevices.find(d=>d.id===n.machine).name+' →';button.onclick=()=>{$('techDialog').close();selectType(allDevices.findIndex(d=>d.id===n.machine));};products.append(button);}
      const button=document.createElement('button');button.className='primary';button.dataset.startResearch=n.id;
      button.onclick=()=>{const result=game.startResearch(n.id);say(result.error||`开始研究「${n.name}」，已投入费用和材料。`,!!result.error);updateUI();};
      card.append(parent,title,description,products,cost,state,progress,button);column.append(card);researchCards.set(n.id,{card,button,state,progress});
    }$('techTree').append(column);
  }
  selectResearchTab(researchTab);
  for(const item of Object.values(DATA.production.items).filter(i=>i.value>0)){
    const cell=document.createElement('div'),img=document.createElement('img'),text=document.createElement('span');img.src=item.image;img.alt='';text.dataset.stock=item.id;cell.append(img,text);$('techStock').append(cell);
  }
}
function updateEconomyUI(){
  const job=game.researchJob,n=job&&game.researchNode(job.id),paused=game.phase!=='running';
  $('researchSummary').textContent=job?`${n.name} · ${Math.ceil(job.remaining)}s${paused?'（暂停）':''}`:`已研究 ${game.researched.length} / ${DATA.economy.nodes.length} · 每局重置`;
  $('researchMeter').style.width=job?(1-job.remaining/n.seconds)*100+'%':'0%';
  $('techStatus').textContent=`部署费用 ${money(game.dp)} / ${money(game.dpCapacity())} 折金票 · ${paused?'时间暂停，可提交研究；开始或继续演练后推进。':'研究随演练时间推进，波间整备继续研究。'}`;
  for(const [id,view] of researchCards){
    const done=game.researched.includes(id),active=job?.id===id,error=game.researchError(id),node=game.researchNode(id);
    view.card.classList.toggle('complete',done);view.card.classList.toggle('researching',active);
    view.card.classList.toggle('available',!error);
    view.button.disabled=!!error;view.button.textContent=done?'研究完成':active?`${Math.ceil(job.remaining)}s · ${paused?'已暂停':'研究中'}`:'开始研究';
    view.state.textContent=done?'本局已解锁':active?'已扣除费用与材料':error||'条件满足';view.state.title=game.materialText(node.materials);
    view.progress.hidden=!active;view.progress.value=active?node.seconds-job.remaining:0;
  }
  for(const el of document.querySelectorAll('[data-stock]')){const id=el.dataset.stock;el.textContent=DATA.production.items[id].name+' ×'+game.warehouseCount(id);}
  $('deploymentCount').title='建筑数量不限；仍需空地、部署费用及对应科技和材料。';
}
function updateTowerEconomy(def,t){
  const next=t&&DATA.towers[t.type].upgrades[t.level-1],build=next||def;
  const lines=[];
  if(next)lines.push(`伤害：${def.damage} → ${next.damage}`);
  if(build.research)lines.push('研究：'+game.researchNode(build.research).name+(game.researched.includes(build.research)?'（已完成）':'（未完成）'));
  if(Object.keys(build.materials||{}).length)lines.push((next?'改装':'制造')+'材料：'+game.materialText(build.materials));
  if(t&&next){const error=game.upgradeError(t);if(error)lines.push(error);}
  else if(!t){const error=game.constructionError(def);if(error)lines.push(error);}
  $('upgradeRequirement').textContent=lines.join('\n');$('upgradeRequirement').hidden=!lines.length;
  const a=def.ammo;
  $('supplyDetail').textContent=a?`弹药：${DATA.production.items[a.item].name} ×1 / ${a.volleys} 次攻击${t?' · 装填余量 '+(t.ammoRemaining||0):''}${t&&game.ammunitionError(t)?'\n待补给：'+game.ammunitionError(t):''}`:'基础火力 · 不消耗弹药';
  $('supplyDetail').hidden=false;$('supplyDetail').classList.toggle('shortage',!!t&&!!game.ammunitionError(t));
}
