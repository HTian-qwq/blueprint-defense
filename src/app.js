'use strict';
const $=id=>document.getElementById(id), canvas=$('board'), ctx=canvas.getContext('2d');
const game=new BlueprintTD.Game(DATA), images=new Map();
const camera=new BlueprintCamera(DATA.map.width,DATA.map.height);
const actors=new BlueprintActors(DATA.wisadel,{lazy:!!globalThis.BlueprintBuild?.web});
const sound=new BlueprintSound(SOUNDS,updateAudioUI,DATA.map.width);
function updateAudioUI(){
  const quiet=sound.muted||sound.volume===0,button=$('soundBtn');
  button.textContent=sound.state==='failed'?'音效 · 不可用':quiet?'音效 · 静音':sound.state==='ready'?'音效 · 开':sound.state==='loading'?'音效 · 加载中':'音效 · 待启用';
  button.setAttribute('aria-pressed',String(!quiet&&sound.state==='ready'));
  button.title=sound.error||'战斗音效与语音 · 点击切换静音';
  $('volume').value=Math.round(sound.volume*100);$('volumeValue').textContent=Math.round(sound.volume*100)+'%';
}
function flushAudio(){sound.consume(game.drainAudioEvents(),!document.hidden&&['ready','running'].includes(game.phase),game.time);}
document.addEventListener('pointerdown',e=>{if(e.target!==$('soundBtn'))void sound.unlock();},{capture:true});
document.addEventListener('keydown',e=>{if(e.isTrusted&&!e.repeat)void sound.unlock();},{capture:true});
$('soundBtn').onclick=()=>{
  if(sound.state==='ready'&&!sound.muted&&sound.volume>0)sound.setMuted(true);
  else{sound.setMuted(false);if(sound.volume===0)sound.setVolume(.45);void sound.unlock();}
};
$('volume').addEventListener('input',e=>{sound.setVolume(Number(e.target.value)/100);if(sound.volume>0){sound.setMuted(false);void sound.unlock();}});
updateAudioUI();
let choice=-1, selected=null, hover=null, speed=1, deckPage=-1, last=0, accumulator=0, view={s:1,ox:0,oy:0}, lastUI=0;
let visualClock=0,menuPainted=false;
let buildDirection=0;
const towerCount=DATA.towers.length,allDevices=[...DATA.towers,...DATA.production.types],directionNames=['向右 →','向下 ↓','向左 ←','向上 ↑'];
const devicePortrait=def=>def.easterEgg?DATA.wisadel.portrait:DATA.deviceArt[def.artId||def.id]?.image||def.image;
$('blueprintPaper').src=DATA.ui.cover;$('blueprintCover').src=devicePortrait(DATA.map.core);
const devicePage=i=>i<towerCount?Math.min(1,Math.floor(i/4)):allDevices[i].category==='warehouse'?3:2;
const choiceDef=()=>allDevices[choice];
const productionChoice=()=>choice>=DATA.towers.length;
let loadedImages=0;
const initialImages=[DATA.map.core,...DATA.towers.flatMap(t=>[t,...t.upgrades]),...DATA.enemies,...DATA.production.types.flatMap(d=>[d,...(d.faces||[]).map((image,dir)=>({id:d.id+'@'+dir,image}))]),...Object.values(DATA.production.items),...Object.entries(DATA.sprites).map(([id,image])=>({id,image}))];
const fontReady=Promise.all([document.fonts.load('400 16px "HarmonyOS Sans SC"'),document.fonts.load('700 16px "HarmonyOS Sans SC"')]);
const ready=Promise.all(initialImages.map(d=>new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>{images.set(d.id,img);globalThis.BlueprintBoot?.reportImages(++loadedImages,initialImages.length);resolve();};img.onerror=()=>reject(Error('图像加载失败：'+d.id));img.src=d.image;
})).concat(actors.ready,globalThis.BlueprintBuild?.web?Promise.resolve():fontReady));
void fontReady.then(()=>{resize();}).catch(()=>{});
function say(text,error=false){$('status').textContent=text;$('status').style.color=error?'#a84729':'';}
function selectType(index,keepPage=false){clearBulkTools();movingId=null;beltDraft=null;rotationLocked=false;choice=index;if(!keepPage||deckPage>=0)deckPage=devicePage(index);selected=null;if(['unloader','loader'].includes(choiceDef().kind))buildDirection=choiceDef().defaultDir;invalidatePlacement();updateUI();$('sidebarScroll').scrollTop=0;say(`已选择${choiceDef().name}：${choiceDef().kind==='belt'?'按住拖拽铺设整段传送带，松开确认':'点击空地部署'}${productionChoice()?'，R 锁定朝向，G 开关自动对齐':''}，Esc 取消。`);}
function cancel(){clearBulkTools();choice=-1;selected=null;hover=null;movingId=null;beltDraft=null;invalidatePlacement();updateUI();}
function reset(){sound.stopAll();game.reset();productionOptions.clear();boardInput.reset();buildDirection=0;cancel();speed=1;accumulator=0;$('speedBtn').textContent='1×';updateUI();say(game.config.rules.initialDP===500?'罗丹挑战已准备。50,000 折金票、全科技与每种成品 60 份，可直接布阵。':'新演练已准备。先搭建产线供应折金票，再部署防御塔。');}
function resize(){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
  camera.resize(rect.width,rect.height);syncCamera();hover=null;
}
function syncCamera(){view=camera.view;$('zoomLevel').textContent=Math.round(camera.zoom*100)+'%';$('zoomOut').disabled=camera.zoom<=camera.min+1e-8;$('zoomIn').disabled=camera.zoom>=camera.max-1e-8;}
new ResizeObserver(resize).observe($('boardWrap'));
function screen(x,y){return {x:view.ox+x*view.s,y:view.oy+y*view.s};}
function pointer(event){const r=canvas.getBoundingClientRect();return {x:Math.floor((event.clientX-r.x-view.ox)/view.s),y:Math.floor((event.clientY-r.y-view.oy)/view.s)};}
function circle(x,y,r,color,fill=true){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(fill){ctx.fillStyle=color;ctx.fill();}else{ctx.strokeStyle=color;ctx.stroke();}}
function strokeLine(x,y,tx,ty,color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();}
function crystal(x,y,r,angle,color){ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.48,0);ctx.lineTo(0,r);ctx.lineTo(-r*.48,0);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#e5ffff';ctx.lineWidth=.8;ctx.stroke();ctx.restore();}
function drawProjectile(shot){
  const {s}=view,p=screen(shot.x,shot.y),q=screen(shot.tx,shot.ty),u=Math.max(0,Math.min(1,1-shot.remaining/shot.total));
  const dx=q.x-p.x,dy=q.y-p.y,angle=Math.atan2(dy,dx);ctx.save();
  if(shot.kind==='pierce'){
    ctx.globalAlpha=.15+u*.5;strokeLine(p.x,p.y,q.x,q.y,'#8e65c1',1);
    const radius=s*(.36-u*.19);ctx.globalAlpha=.8;ctx.lineWidth=1.4;circle(p.x,p.y,radius,'#957dc6',false);
    for(let i=0;i<4;i++){const a=visualClock*4+i*Math.PI/2;circle(p.x+Math.cos(a)*radius,p.y+Math.sin(a)*radius,2,'#dcc7ff');}
    circle(p.x,p.y,2+u*3,'#fff7ff');
  }else if(shot.kind==='chain'){
    ctx.shadowColor='#93bcff';ctx.shadowBlur=8;strokeLine(p.x,p.y,p.x+dx*u,p.y+dy*u,'#90b9f5',2);circle(p.x+dx*u,p.y+dy*u,s*.1,'#eef6ff');
  }else if(shot.kind==='acid'){
    const a={x:p.x+dx*u,y:p.y+dy*u-Math.sin(u*Math.PI)*s*.4};
    circle(a.x,a.y,s*.14,'#7dad4c');circle(a.x-s*.035,a.y-s*.035,s*.06,'#d4ed96');
  }else if(shot.kind==='flame'){
    for(let i=0;i<8;i++){const t=u*i/8;ctx.globalAlpha=(1-i/10)*.8;circle(p.x+dx*t,p.y+dy*t,s*(.05+i*.024),'#ec9b45');}
  }else if(shot.kind==='splash'||shot.kind==='mortar'){
    const heavy=shot.kind==='mortar',easter=shot.stats.easterEgg;
    const arc=t=>({x:p.x+dx*t,y:p.y+dy*t-Math.sin(t*Math.PI)*s*(heavy?2.2:.8)});
    const a=arc(u);ctx.globalAlpha=.2;circle(p.x+dx*u,p.y+dy*u,s*.075,'#5d5b4b');
    for(let i=1;i<=6;i++){const b=arc(Math.max(0,u-i*.045));ctx.globalAlpha=(1-i/7)*.35;circle(b.x,b.y,s*(.06+i*.013),'#9d8875');}
    ctx.globalAlpha=1;circle(a.x,a.y,s*(heavy?.15:.083),easter?'#8d354e':'#6f4832');circle(a.x,a.y,s*(heavy?.07:.046),'#ffe8a1');
    if(heavy){ctx.setLineDash([3,4]);ctx.lineWidth=1.2;circle(q.x,q.y,s*shot.stats.splashRadius*(.65+.35*u),easter?'#b7556c80':'#97774966',false);ctx.setLineDash([]);}
  }else if(shot.kind==='slow'){
    for(let i=4;i>=1;i--){const f=Math.max(0,u-i*.05);ctx.globalAlpha=(1-i/5)*.45;circle(p.x+dx*f,p.y+dy*f,s*.09,'#66bbd3');}
    ctx.globalAlpha=1;crystal(p.x+dx*u,p.y+dy*u,s*.145,visualClock*4,'#80d1e7');
  }else{
    const tail=Math.max(0,u-.21);ctx.shadowColor='#ebaa43';ctx.shadowBlur=6;
    strokeLine(p.x+dx*tail,p.y+dy*tail,p.x+dx*u,p.y+dy*u,shot.kind==='snipe'?'#fff2a5':'#d99033',shot.empowered||shot.kind==='snipe'?5:3);
    strokeLine(p.x+dx*Math.max(0,u-.11),p.y+dy*Math.max(0,u-.11),p.x+dx*u,p.y+dy*u,'#fff5c2',1.5);
  }ctx.restore();
}
function drawImpact(e){
  const {s}=view,p=screen(e.x,e.y),f=e.ttl/e.total,u=1-f;ctx.save();ctx.globalAlpha=f;
  if(e.kind==='income'){
    ctx.font=`bold ${Math.max(10,s*.3)}px "HarmonyOS Sans SC", sans-serif`;ctx.textAlign='center';ctx.fillStyle='#407955';ctx.fillText('+'+money(e.value)+' 折金票',p.x,p.y-s*(.3+u*.65));
  }else if(e.kind==='muzzle'){
    ctx.translate(p.x,p.y);ctx.rotate(e.angle);ctx.fillStyle='#edb051';ctx.beginPath();ctx.moveTo(0,-s*.055);ctx.lineTo(s*(.36*f+.08),0);ctx.lineTo(0,s*.055);ctx.lineTo(s*.045,0);ctx.fill();circle(0,0,s*.07*f,'#fff8d5');
  }else if(e.kind==='kill'){
    ctx.lineWidth=1.2;circle(p.x,p.y,s*(.15+u*.35),e.color,false);
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;circle(p.x+Math.cos(a)*u*s*.4,p.y+Math.sin(a)*u*s*.4,1.5,e.color);}
  }else if(['bossPulse','bossPhase','enemyHeal','enemyWard','enemySummon','enemyBlast','evade'].includes(e.kind)){
    const color=({enemyHeal:'#6ca978',enemyWard:'#729be0',enemySummon:'#ac76c4',enemyBlast:'#e18932',evade:'#9a8dbb',bossPhase:'#f18345'})[e.kind]||'#bf6749',radius=s*(e.radius||.7)*u;
    circle(p.x,p.y,radius,color+'33');ctx.lineWidth=e.kind==='bossPhase'?4:2;circle(p.x,p.y,radius,color,false);
    if(e.kind==='enemyHeal'){ctx.font=`bold ${s*.45}px "HarmonyOS Sans SC", sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText('+',p.x,p.y-s*.3*u);}
    if(e.kind==='evade'){ctx.font=`${s*.2}px "HarmonyOS Sans SC", sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText('闪避',p.x,p.y-s*.5);}
  }else if(e.kind==='blink'||e.kind==='enemyShot'){
    const q=screen(e.tx,e.ty);ctx.setLineDash(e.kind==='blink'?[3,5]:[]);strokeLine(p.x,p.y,q.x,q.y,e.kind==='blink'?'#a383ba':'#c77663',3*f);circle(q.x,q.y,s*.3*u,'#ab80af',false);
  }else if(e.kind==='chain'){
    const points=e.points||[];ctx.shadowBlur=8;ctx.shadowColor='#6398ed';
    for(let j=1;j<points.length;j++){const a=screen(points[j-1].x,points[j-1].y),b=screen(points[j].x,points[j].y);
      ctx.beginPath();ctx.moveTo(a.x,a.y);for(let i=1;i<=9;i++){const t=i/9,k=i===9?0:Math.sin(i*5+visualClock*22)*s*.1;ctx.lineTo(a.x+(b.x-a.x)*t+k,a.y+(b.y-a.y)*t-k);}ctx.strokeStyle='#b6d8ff';ctx.lineWidth=2.2*f;ctx.stroke();circle(b.x,b.y,s*.15*f,'#f2f8ff');}
  }else if(e.kind==='acid'){
    circle(p.x,p.y,s*(.15+u*1.15),'#8ab75244');ctx.strokeStyle='#709d47';ctx.lineWidth=1;circle(p.x,p.y,s*(.2+u),'#87b250',false);
    for(let i=0;i<9;i++){const a=i*2.4;circle(p.x+Math.cos(a)*u*s*.7,p.y+Math.sin(a)*u*s*.7,s*.055,'#b8d879');}
  }else if(e.kind==='flame'){
    circle(p.x,p.y,s*(.2+u*.65),'#f0a34266');
  }else if(e.kind==='splash'||e.kind==='mortar'){
    const r=s*(.16+u*(e.radius||1.15)),g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
    g.addColorStop(0,'#fff7c8');g.addColorStop(.24,'#efbe6a');g.addColorStop(.6,'#d8784166');g.addColorStop(1,'#c7752f00');
    circle(p.x,p.y,r,g);ctx.globalAlpha=f*.7;ctx.lineWidth=1.5;circle(p.x,p.y,r,'#cf8a4c',false);
    for(let i=0;i<14;i++){const a=i*2.399+(e.id||0),reach=s*(.12+u*(.55+(i%4)*.16));
      const x=p.x+Math.cos(a)*reach,y=p.y+Math.sin(a)*reach;
      strokeLine(x,y,x+Math.cos(a)*s*.095*f,y+Math.sin(a)*s*.095*f,i%3?'#b57440':'#f1c16b',1.5);}
    if(e.kind==='mortar'){ctx.globalAlpha=f;ctx.lineWidth=3*f;circle(p.x,p.y,r,e.easterEgg?'#a84767':'#8f7857',false);if(e.easterEgg){ctx.font=`bold ${s*.3}px "HarmonyOS Sans SC", sans-serif`;ctx.fillStyle='#9a3e59';ctx.textAlign='center';ctx.fillText('W',p.x,p.y-r*.5);}}
  }else if(e.kind==='slow'){
    const r=s*(.2+u*1.05),g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,'#dbfbffaa');g.addColorStop(.55,'#81d1e966');g.addColorStop(1,'#6ec4e000');
    circle(p.x,p.y,r,g);ctx.lineWidth=1;circle(p.x,p.y,r,'#5cb8d1',false);
    for(let i=0;i<8;i++){const a=i*Math.PI/4+.2,rr=s*(.18+u*.9);ctx.globalAlpha=f*.85;crystal(p.x+Math.cos(a)*rr,p.y+Math.sin(a)*rr,s*.11*f,a,'#93d8eb');}
  }else if(e.kind==='pierce'){
    const q=screen(e.tx,e.ty),dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
    ctx.globalAlpha=f*.22;strokeLine(p.x,p.y,q.x,q.y,'#9b70c7',s*.24);
    ctx.globalAlpha=f;strokeLine(p.x,p.y,q.x,q.y,'#9570c2',Math.max(1,s*.075*f));strokeLine(p.x,p.y,q.x,q.y,'#fff8ff',Math.max(1,s*.026*f));
    for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(p.x,p.y);for(let i=1;i<=15;i++){const t=i/15,offset=Math.sin(i*1.9+visualClock*35+side)*s*.07*f;ctx.lineTo(p.x+dx*t+nx*offset,p.y+dy*t+ny*offset);}ctx.strokeStyle='#8c6ab499';ctx.lineWidth=1;ctx.stroke();}
    circle(p.x,p.y,s*.11*f,'#ffffff');ctx.lineWidth=1;circle(q.x,q.y,s*(.1+u*.3),'#ad86ce',false);
  }else{
    for(let i=0;i<6;i++){const a=i*Math.PI/3+(e.id||0),r=s*(.07+u*.26);strokeLine(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r,p.x+Math.cos(a)*(r+s*.08*f),p.y+Math.sin(a)*(r+s*.08*f),'#b8833a',1.5);}
    circle(p.x,p.y,s*.07*f,'#fff2bb');
  }ctx.restore();
}
function draw(){
  const {s,ox,oy,w,h}=view;ctx.clearRect(0,0,w,h);ctx.fillStyle='#e5e4e4';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#ccc9cc';ctx.lineWidth=.65;ctx.beginPath();
  for(let x=Math.floor(-ox/s);x<=(w-ox)/s;x++){ctx.moveTo(ox+x*s,0);ctx.lineTo(ox+x*s,h);}
  for(let y=Math.floor(-oy/s);y<=(h-oy)/s;y++){ctx.moveTo(0,oy+y*s);ctx.lineTo(w,oy+y*s);}ctx.stroke();
  ctx.strokeStyle='#b8b5b9';ctx.lineWidth=1;ctx.strokeRect(ox,oy,DATA.map.width*s,DATA.map.height*s);
  ctx.fillStyle='#969297';for(const x of [ox,ox+DATA.map.width*s])for(const y of [oy,oy+DATA.map.height*s])ctx.fillRect(x-2,y-2,4,4);
  // Use the unmodified native straight and corner sprites, including their arrows.
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const tile of game.belts){
    const p=screen(tile.x+.5,tile.y+.5),img=images.get(tile.sprite);if(!img)continue;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(tile.angle*Math.PI/180);ctx.drawImage(img,-s/2,-s/2,s,s);ctx.restore();
  }
  // Map coordinate marks and protected industrial parcels.
  ctx.font=`${Math.max(7,s*.13)}px "HarmonyOS Sans SC", sans-serif`;ctx.textAlign='center';ctx.fillStyle='#a29ca5';
  for(let x=1;x<DATA.map.width;x+=2){const p=screen(x+.5,DATA.map.height+.4);ctx.fillText(String(x).padStart(2,'0'),p.x,p.y);}
  ctx.save();ctx.setLineDash([3,4]);ctx.strokeStyle='#c2bdc5';ctx.lineWidth=1;
  for(const [x,y,ww,hh,label] of DATA.map.sectors){const p=screen(x,y);ctx.strokeRect(p.x,p.y,ww*s,hh*s);ctx.fillStyle='#a09aa5';ctx.font=`${Math.max(10,s*.36)}px "HarmonyOS Sans SC", sans-serif`;ctx.fillText(label,p.x+ww*s/2,p.y+s*.8);}
  ctx.restore();
  const first=screen(game.path[0].x+.5,game.path[0].y+.5);
  ctx.fillStyle='#c36e5c';ctx.fillRect(first.x-s*.42,first.y-s*.42,s*.84,s*.84);ctx.fillStyle='#fff';ctx.font=`bold ${s*.22}px "HarmonyOS Sans SC", sans-serif`;ctx.fillText('IN',first.x,first.y+s*.075);
  const core=DATA.map.core,cp=screen(core.x,core.y),cw=core.footprint.width*s,ch=core.footprint.depth*s;
  ctx.fillStyle='#e1e1e3';ctx.fillRect(cp.x,cp.y,cw,ch);const coreImage=images.get(core.id);if(coreImage)ctx.drawImage(coreImage,cp.x,cp.y,cw,ch);
  ctx.strokeStyle=selected==='protocol-core'?'#429aa8':'#82afb1';ctx.lineWidth=selected==='protocol-core'?3:1;ctx.strokeRect(cp.x,cp.y,cw,ch);
  drawCorePorts();
  ctx.fillStyle='#445b5e';ctx.font=`bold ${Math.max(11,s*.45)}px "HarmonyOS Sans SC", sans-serif`;ctx.fillText('协议核心',cp.x+cw/2,cp.y-s*.35);
  ctx.fillStyle='#b7c6c7';ctx.fillRect(cp.x+s,cp.y-s*.18,cw-2*s,s*.16);ctx.fillStyle=game.life>3?'#4599a3':'#bf6453';ctx.fillRect(cp.x+s,cp.y-s*.18,(cw-2*s)*Math.max(0,game.life)/game.config.rules.life,s*.16);
  const tower=game.towers.find(t=>t.id===selected);
  const held=placementPlan(),footprint=held&&!held.production?game.footprint(held.def):null;
  const show=footprint?{x:held.x+footprint.width/2,y:held.y+footprint.depth/2,range:held.def.range,bad:held.error}:tower&&movingId==null?{...game.towerCenter(tower),range:game.stats(tower).range}:null;
  if(show){const p=screen(show.x,show.y),bad=show.bad;
    circle(p.x,p.y,show.range*s,bad?'#c2685621':'#66979720');ctx.lineWidth=1;ctx.setLineDash([5,4]);circle(p.x,p.y,show.range*s,bad?'#bd665d':'#4e9297',false);ctx.setLineDash([]);
  }
  for(const z of game.zones){
    const p=screen(z.x,z.y),electric=z.kind==='electric';ctx.save();ctx.globalAlpha=Math.min(1,z.ttl)*.6;
    circle(p.x,p.y,z.radius*s,electric?'#8eaee83a':'#d99a4838');ctx.lineWidth=1;circle(p.x,p.y,z.radius*s,electric?'#809bd0':'#c79355',false);
    for(let i=0;i<9;i++){const a=i*2.4+z.id,rr=s*z.radius*(.3+(i%3)*.2),x=p.x+Math.cos(a)*rr,y=p.y+Math.sin(a)*rr;
      if(electric){circle(x,y,s*.025*(1+Math.sin(visualClock*8+i)), '#a3caff');strokeLine(p.x,p.y,x,y,'#8aaee844',.7);}
      else{const flicker=.06+(.5+.5*Math.sin(visualClock*8+i))*.1;ctx.fillStyle='#e6a34dcc';ctx.beginPath();ctx.moveTo(x-s*.05,y);ctx.quadraticCurveTo(x-s*.09,y-s*flicker,x+s*.025,y-s*(flicker+.06));ctx.quadraticCurveTo(x+s*.09,y-s*.04,x+s*.05,y);ctx.fill();}}
    ctx.restore();
  }
  for(const e of game.enemies){
    if(!e.cast)continue;const c=e.cast,p=screen(c.x??e.x,c.y??e.y),u=Math.min(1,(game.time-c.start)/(c.until-c.start));ctx.save();
    if(c.kind==='boss'){
      circle(p.x,p.y,c.radius*s,e.phase===2?'#e4873429':'#bb61472b');ctx.setLineDash([5,4]);ctx.lineWidth=2;circle(p.x,p.y,c.radius*s,e.phase===2?'#d77835':'#b85e4c',false);ctx.setLineDash([]);
      circle(p.x,p.y,c.radius*s*u,'#c56b5055',false);
      ctx.fillStyle='#983e29';ctx.font=`bold ${Math.max(9,s*.23)}px "HarmonyOS Sans SC", sans-serif`;ctx.textAlign='center';ctx.fillText(e.phase===2?'火焰冲击':'牵引震击',p.x,p.y-c.radius*s-6);
    }else if(c.kind==='suppress'){const q=screen(c.tx,c.ty);ctx.setLineDash([3,4]);strokeLine(p.x,p.y,q.x,q.y,'#b65e4b',1.5);circle(q.x,q.y,s*.45,'#b65e4b',false);}
    else{
      const color={heal:'#4b9664',ward:'#6187c7',summon:'#9661b1'}[c.kind],label={heal:'治疗',ward:'护盾',summon:'召唤'}[c.kind];
      circle(p.x,p.y,c.radius*s,color+'18');ctx.lineWidth=1.5;ctx.setLineDash([3,4]);circle(p.x,p.y,c.radius*s,color,false);ctx.setLineDash([]);
      ctx.fillStyle=color;ctx.font=`bold ${Math.max(9,s*.2)}px "HarmonyOS Sans SC", sans-serif`;ctx.textAlign='center';ctx.fillText(label+' '+Math.max(0,c.until-game.time).toFixed(1)+'s',p.x,p.y-c.radius*s-5);
    }
    ctx.restore();
  }
  for(const h of game.enemyHazards){
    const p=screen(h.x,h.y);ctx.save();circle(p.x,p.y,h.radius*s,'#da803b20');ctx.lineWidth=2;ctx.setLineDash([4,4]);circle(p.x,p.y,h.radius*s,'#cb7030',false);ctx.setLineDash([]);
    ctx.fillStyle='#9f4c1f';ctx.textAlign='center';ctx.font=`bold ${Math.max(9,s*.22)}px "HarmonyOS Sans SC", sans-serif`;ctx.fillText('爆破 '+Math.max(0,h.until-game.time).toFixed(1)+'s',p.x,p.y);ctx.restore();
  }
  const warehouseOnline=game.warehouseConnections();
  for(const unit of [...game.warehouseLine,...game.production]){if(unit.id===movingId||groupMove&&batchSelection.has(unit.id))drawMovedOrigin(unit,true);else drawProduction(unit,warehouseOnline);}
  for(const t of game.towers){
    if(t.id===movingId||groupMove&&batchSelection.has(t.id)){drawMovedOrigin(t,false);continue;}
    const p=screen(t.x,t.y),def=game.stats(t),foot=game.footprint(def),w=foot.width*s,h=foot.depth*s;ctx.fillStyle='#e4e2e4';ctx.fillRect(p.x+1,p.y+1,w-2,h-2);
    const img=images.get(def.easterEgg?'battle_rocket_1':def.id);
    if(img){ctx.save();ctx.globalAlpha=def.easterEgg?.12:1;ctx.drawImage(img,p.x+1,p.y+1,w-2,h-2);ctx.restore();}
    if(def.easterEgg){
      ctx.strokeStyle='#a8506577';ctx.lineWidth=1;ctx.strokeRect(p.x+2,p.y+2,w-4,h-4);
      if(t.aimTargetId!=null&&t.disabledUntil<=game.time){ctx.save();ctx.translate(p.x+w/2,p.y+h/2);ctx.rotate(t.aimAngle);ctx.strokeStyle='#ae526ac0';ctx.lineWidth=Math.max(1,s*.04);ctx.beginPath();ctx.moveTo(w*.34-s*.14,-s*.11);ctx.lineTo(w*.34,0);ctx.lineTo(w*.34-s*.14,s*.11);ctx.stroke();ctx.restore();}
      if(!actors.draw(ctx,t,game.time,p,s,foot)){const portrait=images.get(def.id);if(portrait)ctx.drawImage(portrait,p.x+w*.15,p.y+h*.12,w*.7,h*.75);}
    }
    ctx.fillStyle=def.color;ctx.fillRect(p.x+w*.13,p.y+h*.93,(w*.74)*Math.min(1,1-t.cooldown/def.interval),3);
    ctx.textAlign='center';
    if(t.level>1){ctx.fillStyle='#27382b';ctx.fillRect(p.x+w-s*.36,p.y+s*.04,s*.32,s*.27);ctx.fillStyle='#e8f3b4';ctx.font=`${s*.19}px "HarmonyOS Sans SC", sans-serif`;ctx.fillText('+'+(t.level-1),p.x+w-s*.2,p.y+s*.24);}
    if(def.easterEgg){ctx.fillStyle='#a74763';ctx.fillRect(p.x+s*.04,p.y+s*.04,s*.3,s*.27);ctx.fillStyle='#fff1d4';ctx.font=`bold ${s*.2}px "HarmonyOS Sans SC", sans-serif`;ctx.fillText('W',p.x+s*.19,p.y+s*.24);}
    if(t.disabledUntil>game.time){ctx.fillStyle='#bc654b55';ctx.fillRect(p.x,p.y,w,h);strokeLine(p.x+w*.18,p.y+h*.2,p.x+w*.82,p.y+h*.8,'#ad4f32',2);ctx.fillStyle='#9f3b24';ctx.font=`bold ${Math.max(8,s*.28)}px "HarmonyOS Sans SC", sans-serif`;ctx.fillText((t.disabledUntil-game.time).toFixed(1),p.x+w*.5,p.y+h*.65);}
    if(t.id===selected){ctx.strokeStyle='#489da9';ctx.lineWidth=2;ctx.strokeRect(p.x-2,p.y-2,w+4,h+4);}
    if(t.awaitingSupply&&game.ammunitionError(t)){ctx.fillStyle='#a97035';ctx.fillRect(p.x+2,p.y+h*.63,w-4,Math.max(12,s*.32));ctx.fillStyle='#fff6dc';ctx.font=`${Math.max(9,s*.23)}px "HarmonyOS Sans SC", sans-serif`;ctx.fillText('待补给',p.x+w/2,p.y+h*.63+Math.max(10,s*.25));}
  }
  drawBuildPreview();drawBulkTools();
  for(const e of game.enemies){
    const p=screen(e.x,e.y),d=DATA.enemies[e.type],r=s*(d.boss?.63:d.role==='精英'?.45:e.type===3?.39:d.badge?.34:.28);ctx.save();
    if(d.boss){ctx.lineWidth=3;circle(p.x,p.y,r+5,e.phase===2?'#df783f':'#a55241',false);}
    if(d.flying){ctx.globalAlpha=.18;circle(p.x,p.y+s*.14,r,'#3c535e');ctx.globalAlpha=1;ctx.lineWidth=1.5;strokeLine(p.x-r*1.5,p.y,p.x-r,p.y-s*.12,'#639eb0',1.5);strokeLine(p.x+r*1.5,p.y,p.x+r,p.y-s*.12,'#639eb0',1.5);}
    circle(p.x,p.y,r+2,'#b47c6b');circle(p.x,p.y,r,'#e4dfd3');
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.clip();
    const img=images.get(d.id);if(img)ctx.drawImage(img,p.x-r,p.y-r,r*2,r*2);
    if(e.hitUntil>game.time){ctx.fillStyle='#fff9';ctx.fillRect(p.x-r,p.y-r,r*2,r*2);}ctx.restore();
    if(e.slowUntil>game.time){ctx.lineWidth=2;circle(p.x,p.y,r+3,'#63b9d2',false);}
    if(e.armorBreakUntil>game.time){ctx.lineWidth=2;circle(p.x,p.y,r+5,'#89af51',false);}
    if(d.rageSpeed&&e.hp<e.maxHp/2){ctx.lineWidth=2;circle(p.x,p.y,r+2,'#de6c3f',false);}
    if(e.shield>0){ctx.lineWidth=1.5;circle(p.x,p.y,r+3,'#88a7e1',false);ctx.fillStyle='#84a3dc';ctx.fillRect(p.x-r,p.y-r-11,r*2*e.shield/e.maxShield,2);}
    ctx.fillStyle='#6f534e';ctx.fillRect(p.x-r,p.y-r-7,r*2,3);ctx.fillStyle=e.type===3?'#bb8d41':'#b66950';ctx.fillRect(p.x-r,p.y-r-7,r*2*Math.max(0,e.hp/e.maxHp),3);
    if(d.badge){const size=Math.max(10,s*.24);ctx.fillStyle=d.heal?'#3c8057':d.ward?'#527ab7':d.summon?'#825799':'#ad642d';ctx.fillRect(p.x+r-size*.7,p.y+r-size*.7,size,size);ctx.fillStyle='#fff';ctx.font=`bold ${size*.8}px "HarmonyOS Sans SC", sans-serif`;ctx.textAlign='center';ctx.fillText(d.badge,p.x+r-size*.2,p.y+r+size*.08);}
  }
  for(const shot of game.projectiles)drawProjectile(shot);
  for(const effect of game.effects)drawImpact(effect);
  if(game.phase==='paused'){ctx.fillStyle='#292b2fea';ctx.fillRect(w/2-116,20,232,34);ctx.fillStyle='#f1f2b3';ctx.font='12px "HarmonyOS Sans SC", sans-serif';ctx.textAlign='center';ctx.fillText('Ⅱ  演练暂停 · 空格继续',w/2,42);}
}
const deckButtons=[];
for(const [i,t] of allDevices.entries()){
  const production=i>=towerCount,btn=document.createElement('button');btn.className='unit-card';if(production)btn.dataset.productionType=i-towerCount;else btn.dataset.type=i;btn.style.setProperty('--unit-color',DATA.deviceArt[t.id]?.color||t.color);btn.setAttribute('aria-label',`${t.name}，${money(t.cost)} 折金票，${t.role}`);btn.title=`${t.name} · ${money(t.cost)} 折金票\n${t.desc}`;
  const img=document.createElement('img');img.src=devicePortrait(t);img.alt='';
  const text=document.createElement('div');text.className='card-text';
  const role=document.createElement('span');role.className='role';role.textContent=t.role;
  const h=document.createElement('h3');h.textContent=t.name;const p=document.createElement('p');p.textContent=production?{unloader:'选物品 · 3 秒 / 份',hub:'原料无限 · 网络起点',bus:'相邻基段接通',loader:'产物存入公共仓库',belt:'按 R 转向',processor:'原版配方 · 按批加工',supply:'费用 / 材料入库'}[t.kind]:`${t.targets==='ground'?'对地':'对空/地'} · 射程 ${t.range.toFixed(1)}`;
  text.append(role,h,p);const cost=document.createElement('span');cost.className='cost';cost.innerHTML='<small>折金票</small>'+money(t.cost);
  const key=document.createElement('span');key.className='hotkey';key.textContent=production?'':String(i+1);const count=document.createElement('span');count.className='owned-count';count.textContent='×0';btn.append(img,text,cost,key,count);btn.onclick=()=>selectType(i,true);$('deck').append(btn);deckButtons.push(btn);
  {const lock=document.createElement('span');lock.className='tech-lock';lock.hidden=true;btn.append(lock);}
}
let lastWavePanel='';
let lastUpgradePath='';
function updateUI(){
  invalidatePlacement();updateBuildTools();updateHotbar();
  updateProductionUnlock();
  updateEconomyUI();
  const isCore=selected==='protocol-core',ended=['won','lost'].includes(game.phase),t=game.towers.find(t=>t.id===selected),production=[...game.production,...game.warehouseLine].find(p=>p.id===selected),def=isCore?DATA.map.core:t?game.stats(t):production?DATA.production.types[production.type]:choiceDef(),isProduction=!!production||productionChoice();
  $('blueprintSidebar').classList.toggle('has-selection',!!def||batchSelection.size>1);$('blueprintDeviceCount').textContent=(game.towers.length+game.production.length)+' 台设备';
  $('blueprintTitle').textContent=game.config.rules.initialDP===500?'罗丹挑战':'曲折防线';
  $('dp').textContent=money(game.dp);$('dpMeter').style.width=(game.dp/game.dpCapacity()*100)+'%';$('dp').title=`费用容量 ${money(game.dpCapacity())}`;
  $('productionIncome').textContent='近10秒 +'+money(game.productionReceipts.reduce((n,r)=>n+r.value,0));$('productionIncome').title=`产线累计供应 ${money(game.productionEarned)} 折金票；没有自然回费`;
  $('life').innerHTML=`${String(game.life).padStart(2,'0')}<em> / 10</em>`;
  $('wave').innerHTML=`${String(Math.max(0,game.wave+1)).padStart(2,'0')}<em> / ${String(game.config.waves.length).padStart(2,'0')}</em>`;
  const preparing=game.isPreparing();
  $('waveName').textContent=game.phase==='ready'?'部署准备':game.phase==='won'?'防守成功':game.phase==='lost'?'防线失守':game.phase==='paused'?(preparing?'整备暂停':'战斗暂停'):preparing?'波间整备':game.config.waves[game.wave]?.name||'演练完成';
  $('prepPanel').hidden=!preparing;$('prepPanel').classList.toggle('paused',game.phase==='paused');$('prepPanel').classList.toggle('urgent',game.intermission<=5);
  if(preparing){$('prepCountdown').textContent='00:'+String(Math.ceil(game.intermission)).padStart(2,'0');$('prepTitle').textContent=`${game.phase==='paused'?'整备已暂停':'第 '+(game.wave+1)+' 波已清理'} · 下一波 ${game.config.waves[game.wave+1].enemies.length} 敌人`;$('prepHint').textContent=game.phase==='paused'?'仍可建造与升级 · 倒计时和产线暂停':'可建造与升级 · 产线继续生产 · 准备时间固定 1×';}
  $('prepNextBtn').disabled=game.phase!=='running';
  $('speedBtn').textContent=preparing?'1×':speed+'×';$('speedBtn').disabled=ended||preparing;$('speedBtn').title=preparing?`整备固定 1 倍速；下一波恢复 ${speed} 倍速`:'切换战斗速度';
  $('bossPanel').hidden=!game.boss;
  if(game.boss){const b=game.boss,d=DATA.enemies[b.type],outcome=game.bossOutcome;
    $('bossPortrait').src=d.image;$('bossName').textContent=d.name;$('bossPanel').dataset.phase=String(b.phase);
    $('bossPhase').textContent=outcome==='defeated'?'已击破':outcome==='escaped'?'防线突破':b.phase===2?'PHASE 02 · 吸能强化':'PHASE 01 · 碾骨之拳';
    $('bossHealthFill').style.width=Math.max(0,b.hp/b.maxHp*100)+'%';$('bossHealth').setAttribute('aria-valuenow',String(Math.round(Math.max(0,b.hp/b.maxHp*100))));
    $('bossShieldFill').style.width=(b.maxShield?b.shield/b.maxShield*100:0)+'%';
    $('bossNumbers').textContent=`${Math.ceil(b.hp)} / ${b.maxHp}${b.shield>0?' · 护盾 '+Math.ceil(b.shield):''}`;
    $('bossAbility').textContent=outcome==='defeated'?'罗丹已倒下，清理剩余敌人':outcome==='escaped'?'核心耐久 −10':b.cast?`${b.phase===2?'火焰冲击':'牵引震击'} · ${(Math.max(0,b.cast.until-game.time)).toFixed(1)}s 后命中预警区域`:b.phase===2?'范围冲击使设备停火 2.6 秒':'半血吸能强化 · 红圈内设备将暂时停火';
  }
  $('startBtn').textContent=game.phase==='ready'?'开始演练 ▶':game.phase==='paused'?(preparing?'继续整备 ▶':'继续演练 ▶'):ended?'演练已结束':preparing?'暂停整备 Ⅱ':'暂停 Ⅱ';$('startBtn').disabled=ended;
  $('deploymentCount').textContent=`塔 ${game.towers.length} · 产线 ${game.production.length} · 不限量`;
  $('deck').classList.toggle('production-deck',deckPage===2);
  deckButtons.forEach((b,i)=>{b.hidden=!!allDevices[i].builtIn||deckPage>=0&&devicePage(i)!==deckPage;b.classList.toggle('active',i===choice);b.classList.toggle('poor',game.dp<allDevices[i].cost);b.setAttribute('aria-pressed',String(i===choice));b.disabled=ended;const count=i<towerCount?game.towers.filter(t=>t.type===i).length:game.production.filter(p=>p.type===i-towerCount).length;b.querySelector('.owned-count').textContent='×'+count;b.classList.toggle('owned',count>0);});
  deckButtons.forEach((b,i)=>{const def=allDevices[i],locked=!!def.research&&!game.researched.includes(def.research),badge=b.querySelector('.tech-lock');b.classList.toggle('tech-locked',locked);badge.hidden=!locked;badge.textContent=locked?game.researchNode(def.research).name:'';b.classList.toggle('poor',game.dp<def.cost||!!game.constructionError(def));});
  updateWarehouseInventory(deckPage===3||def?.category==='warehouse');
  document.querySelectorAll('[data-deck-page]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.deckPage)===deckPage)));
  $('inspectorEmpty').hidden=!!def||batchSelection.size>1;$('inspectorDetail').hidden=!def;$('selectionTag').textContent=batchSelection.size>1?`已选中 ${batchSelection.size} 台`:t?`已部署 · Lv.${t.level}`:choice>=0?'等待部署':'待命';
  $('productionConfig').hidden=!isProduction;$('rotateBtn').hidden=!isProduction;$('upgradePath').hidden=isProduction;$('upgradeBtn').hidden=isProduction;
  $('inspectorDetail').classList.toggle('production-inspector',isProduction);$('inspectorDetail').classList.toggle('core-inspector',isCore);
  $('upgradeRequirement').hidden=true;$('supplyDetail').hidden=true;
  updateCoreInspector(isCore,ended);
  if(def){$('detailImage').src=devicePortrait(def);$('detailRole').textContent=(def.role||'防守目标')+(isProduction?'':` · ${game.footprint(def).width}×${game.footprint(def).depth}`);$('detailName').textContent=def.name;$('detailDesc').textContent=def.desc;
    if(isCore){
      $('selectionTag').textContent='协议核心 · 固定设施';$('detailDesc').textContent='上下 14 个入口自动将物品存入共享仓库；左右 6 个出口可分别选择取货物品，传送带直接连接接口。已解锁原料无限供应，成品按库存取货。守住南侧敌人通道，核心不可移动或拆除。';
      $('detailDamage').previousElementSibling.textContent='耐久';$('detailDamage').textContent=game.life+' / '+game.config.rules.life;
      $('detailRange').previousElementSibling.textContent='占地';$('detailRange').textContent='9×9';$('detailInterval').previousElementSibling.textContent='状态';$('detailInterval').textContent=game.life>0?'在线':'失守';
      for(const id of ['towerActions','upgradePath','rotateBtn','placementHint','productionConfig'])$(id).hidden=true;
    }else if(isProduction)updateProductionInspector(def,production,ended);
    else{
    updateTowerEconomy(def,t);
    $('detailDamage').textContent=def.damage+(def.mode==='flame'?'/s':'');$('detailRange').textContent=def.range.toFixed(1);$('detailInterval').textContent=def.interval.toFixed(1)+'s';
    $('detailRange').previousElementSibling.textContent='射程';
    $('detailDamage').previousElementSibling.textContent=def.burst?'整轮伤害':'攻击';$('detailInterval').previousElementSibling.textContent=def.burst?'轮次间隔':'间隔';
    $('towerActions').hidden=!t;$('placementHint').hidden=!!t;$('placementHint').textContent=`部署 ${money(def.cost)} 折金票 · 占地 ${game.footprint(def).width}×${game.footprint(def).depth}。点击位置为左上角，整块占地不能覆盖通道或其他设备。`;
    const base=DATA.towers[t?t.type:choice],pathKey=base.id+':'+(t?.level||0);
    if(pathKey!==lastUpgradePath){lastUpgradePath=pathKey;$('upgradePath').replaceChildren();[base,...base.upgrades].forEach((stage,i)=>{const item=document.createElement('div');item.className='upgrade-stage'+(i+1===(t?.level||1)?' current':'');const img=document.createElement('img');img.src=devicePortrait(stage);img.alt=stage.name;const label=document.createElement('span');label.textContent=stage.upgradeKind==='enhance'?`强化 ${i+1}`:stage.name;item.append(img,label);$('upgradePath').append(item);});}
    if(t){const cost=game.upgradeCost(t),next=base.upgrades[t.level-1];$('upgradeBtn').textContent=!next?'已达路线终点':`${next.upgradeKind==='refit'?'改装为 '+next.name:'强化至 Lv.'+(t.level+1)} · ${money(cost)} 折金票`;$('upgradeBtn').disabled=ended||!!game.upgradeError(t);
      $('withdrawBtn').textContent=`撤回设备 · 返还 ${money(game.refundValue(t))} 折金票`;$('withdrawBtn').disabled=ended;$('towerRecord').textContent=`已消灭 ${t.kills} 个目标 · 累计投入 ${money(t.spent)} 折金票`;}
    }
  }
  const wi=game.wave<0?0:game.intermission>0?Math.min(game.wave+1,game.config.waves.length-1):game.wave,wp=game.config.waves[wi];
  $('waveIntelTitle').textContent=game.wave<0||game.intermission>0?'下一波敌情':'本波敌情';
  const extra=wi===game.wave?game.waveReinforcements:0;
  $('nextLabel').textContent=`第 ${wi+1} 波 · ${wp.enemies.length} 个${extra?' +'+extra+' 援军':''}`;
  const waveKey=wi+':'+(game.intermission>0);
  if(waveKey!==lastWavePanel){lastWavePanel=waveKey;$('nextName').textContent=wp.name;$('waveEnemies').replaceChildren();
    const types=wp.enemies.map(i=>DATA.enemies[i]),threats=[];
    if(types.some(e=>e.summon))threats.push('召唤：优先打断');if(types.some(e=>e.heal))threats.push('治疗：优先击杀');if(types.some(e=>e.ward))threats.push('护盾：拆除支援');if(types.some(e=>e.deathBurst))threats.push('爆破：分散布防');
    $('waveThreats').textContent=threats.join(' · ');$('waveThreats').hidden=!threats.length;
    const counts=new Map();wp.enemies.forEach(i=>counts.set(i,(counts.get(i)||0)+1));
    for(const [i,n] of counts){const e=DATA.enemies[i],box=document.createElement('div');box.className='enemy-preview';box.title=`${e.name} · ${e.role} · ${Math.round(e.hp*wp.hp)} 生命`;
      const img=document.createElement('img');img.src=e.image;img.alt=e.name;const count=document.createElement('span');count.textContent='× '+n;box.append(img,count);$('waveEnemies').append(box);}}
  $('nextBtn').disabled=game.phase!=='running'||!preparing;$('nextBtn').textContent=preparing?`${Math.ceil(game.intermission)}s 整备 · 提前迎敌`:'清理当前波次后整备 30 秒';
  $('boardNote').hidden=game.phase!=='ready'&&game.intermission<=0;$('boardNote').textContent=game.phase==='ready'?(game.config.rules.initialDP===500?'50,000 折金票 准备阵容，第二波迎战罗丹；可选建产线补充费用。':'在底部自带存取线上方放取货口，再接精炼炉 → 协议储存箱。'):`整备 ${Math.ceil(game.intermission)} 秒 · 扩建产线 / 补充炮塔`;
  $('result').hidden=!ended;
  if(ended){$('resultTitle').textContent=game.phase==='won'?'防守成功':'防线失守';$('resultEyebrow').textContent=game.phase==='won'?'PERIMETER SECURED':'CORE SIGNAL LOST';
    $('resultText').textContent=`消灭 ${game.kills} / ${game.total} · 漏过 ${game.leaked} · 剩余耐久 ${game.life} · 用时 ${Math.floor(game.time)} 秒`;}
}
function boardClick(e){
  if(e.button!==0)return;canvas.focus();const p=pointer(e);hover=p;
  if(groupMove){commitBulkMove(p);return;}
  clearBulkTools();
  if(movingId!=null){const plan=placementPlan(p),result=game.moveBuilding(movingId,plan.x,plan.y,plan.dir);if(result.error)say(result.error,true);else{movingId=null;hover=null;say('位置已调整，物料、升级与冷却保持不变。');}updateUI();return;}
  const t=game.towerAt(p.x,p.y),unit=game.productionAt(p.x,p.y);
  if(game.coreAt(p.x,p.y)){choice=-1;selected='protocol-core';say('协议核心：上下接口入库，左右出口在右侧选择物品。');}
  else if(t||unit){
    choice=-1;selected=t?.id||unit.id;
    if(t)say(`已选中${game.stats(t).name}：右侧可升级或撤回。`);
    else say(unit.fixed?'这是自带仓库存取线；在上方放取货口，并在取货口选择物品。':`已选中${DATA.production.types[unit.type].name}：右侧配置物品或配方，R 转向。`);
  }
  else if(choice>=0){const def=choiceDef(),plan=placementPlan(p),result=plan.error?{error:plan.error}:productionChoice()?game.deployProduction(choice-towerCount,plan.x,plan.y,plan.dir):game.deploy(choice,plan.x,plan.y);if(result.error)say(result.error,true);else{hover=null;if(result.unit){buildDirection=plan.dir;if(productionOptions.has(def.id))game.setProductionOption(result.unit.id,productionOptions.get(def.id));}say(`已部署${def.name}，扣除 ${money(def.cost)} 折金票。可继续部署，点击已有设备可配置。`);}}
  else selected=null;
  updateUI();
  if(t||unit||game.coreAt(p.x,p.y))$('sidebarScroll').scrollTop=0;
  if(unit?.corePort==='outputs')$(unit.id).focus();
}
const boardInput=setupBoardInput();
$('startBtn').onclick=()=>{if(game.phase==='ready'){game.start();cancel();say(game.production.length?'演练开始。产线交付成品后获得折金票。':'演练开始。尚无产线，不会自然回费；可在「生产机械」补建。');}else{game.togglePause();say(game.phase==='paused'?'已暂停；可以调整产线、部署或升级设备。':'演练继续。');}if(game.phase==='paused'){sound.stopAll();game.drainAudioEvents();}updateUI();};
$('speedBtn').onclick=()=>{speed=speed===1?2:1;$('speedBtn').textContent=speed+'×';};
function startNextWave(){if(game.nextWave()){accumulator=0;say(`第 ${game.wave+1} 波开始：${game.config.waves[game.wave].name}。`);}updateUI();}
$('nextBtn').onclick=startNextWave;$('prepNextBtn').onclick=startNextWave;
$('resetBtn').onclick=reset;$('againBtn').onclick=reset;
$('upgradeBtn').onclick=()=>{if(game.upgrade(selected)){const t=game.towers.find(t=>t.id===selected);say(`已升级为${game.stats(t).name} · Lv.${t.level}。`);updateUI();}};
$('withdrawBtn').onclick=()=>{const refund=game.production.some(p=>p.id===selected)?game.removeProduction(selected):game.withdraw(selected);cancel();say(`设备已撤回，返还 ${money(refund)} 折金票。`);};
$('rotateBtn').onclick=rotateProductionSelection;
$('copyBtn').onclick=copySelection;$('moveBtn').onclick=beginMove;
$('snapBtn').onclick=()=>{snapEnabled=!snapEnabled;invalidatePlacement();updateUI();say(snapEnabled?'自动对齐已开启；按住 Alt 可临时自由放置。':'自动对齐已关闭，按指向的格子与朝向放置。');};
$('productionOption').onchange=()=>{
  const value=$('productionOption').value,unit=game.production.find(p=>p.id===selected);
  if(unit){const held=unit.cargo,error=game.setProductionOption(unit.id,value);say(error||(DATA.production.types[unit.type].kind==='supply'?'交付方式已更新，箱内物品保持不变。':held?'设置已更新，机内物料已退回仓库，重新计时。':'这台设备的生产设置已更新。'),!!error);}
  else if(productionChoice()){const error=game.productionOptionError(choice-towerCount,value);if(error)say(error,true);else{productionOptions.set(choiceDef().id,value);say('待部署设置已更新，已有设备保持各自的设置。');}}
  updateUI();
};
$('helpBtn').onclick=()=>{if(game.phase==='running')game.togglePause();sound.stopAll();game.drainAudioEvents();updateUI();$('help').showModal();};
$('closeHelp').onclick=()=>$('help').close();
document.querySelectorAll('[data-deck-page]').forEach(b=>b.onclick=()=>{deckPage=Number(b.dataset.deckPage);choice=-1;updateUI();});
for(const enemy of DATA.enemies){const card=document.createElement('article'),img=document.createElement('img'),body=document.createElement('div'),name=document.createElement('b'),stats=document.createElement('small'),desc=document.createElement('p');
  if(enemy.boss)card.classList.add('boss-guide');
  img.src=enemy.image;img.alt=enemy.name;name.textContent=enemy.name+' · '+enemy.role;stats.textContent=`基础生命 ${enemy.hp} · 护甲 ${enemy.armor}${enemy.shield?' · 护盾 '+enemy.shield:''} · 漏过 −${enemy.leak}`;desc.textContent=enemy.desc;body.append(name,stats,desc);card.append(img,body);$('enemyGuideList').append(card);}
$('enemyGuideBtn').textContent=`敌情图鉴 · ${DATA.enemies.length}`;$('enemyGuide').querySelector('h2').textContent=`敌情图鉴 · ${DATA.enemies.length} 种敌人`;
$('scenario').onchange=()=>{
  const practice=$('scenario').value==='boss';game.config=practice?{...DATA,practiceResources:true,waves:DATA.bossPractice.waves,rules:{...DATA.rules,initialDP:DATA.bossPractice.initialDP,maxDP:DATA.bossPractice.maxDP}}:DATA;
  lastWavePanel='';reset();$('scenarioHint').textContent=practice?'全科技 · 成品各 60 · 第二波罗丹':'第 10 波迎战罗丹';
};
$('enemyGuideBtn').onclick=()=>{if(game.phase==='running')game.togglePause();sound.stopAll();game.drainAudioEvents();updateUI();$('enemyGuide').showModal();};
$('closeEnemyGuide').onclick=()=>$('enemyGuide').close();
document.addEventListener('keydown',e=>{
  if(e.key==='Alt'){placementAlt=true;invalidatePlacement();return;}
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.target.matches('input,textarea,select')||e.target.id==='soundBtn')return;
  if(document.querySelector('dialog[open]'))return;
  if(e.shiftKey&&/^Digit[1-9]$/.test(e.code)){e.preventDefault();if(!e.repeat)assignCurrentHotbar(Number(e.code.slice(-1))-1);return;}
  if(e.code==='Space'){e.preventDefault();if(e.repeat)return;$('startBtn').click();}
  else if(/^[1-9]$/.test(e.key)&&!['won','lost'].includes(game.phase)){e.preventDefault();if(!e.repeat)activateHotbar(Number(e.key)-1);}
  else if(e.key.toLowerCase()==='r'&&!e.repeat){e.preventDefault();rotateProductionSelection();}
  else if(['x','b'].includes(e.key.toLowerCase())&&!e.repeat){e.preventDefault();if(groupMove){boardInput.stop();cancelBulkMove();}else toggleBoxMode();}
  else if(e.key.toLowerCase()==='f'||e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(!e.repeat)deleteSelection();}
  else if(e.key.toLowerCase()==='m'&&!e.repeat){e.preventDefault();beginMove();}
  else if(e.key.toLowerCase()==='q'&&!e.repeat){e.preventDefault();copySelection();}
  else if(e.key.toLowerCase()==='g'&&!e.repeat){e.preventDefault();$('snapBtn').click();}
  else if(e.key==='+'||e.key==='='){e.preventDefault();$('zoomIn').click();}
  else if(e.key==='-'){e.preventDefault();$('zoomOut').click();}
  else if(e.key==='0'){e.preventDefault();$('zoomReset').click();}
  else if(e.key==='Escape'){boardInput.stop();if(groupMove)cancelBulkMove();else{cancel();say('已取消选择。');}}
});
document.addEventListener('keyup',e=>{if(e.key==='Alt'){placementAlt=false;invalidatePlacement();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){sound.stopAll();game.drainAudioEvents();if(game.phase==='running'){game.togglePause();updateUI();say('切出页面，演练已自动暂停。');}}});
window.addEventListener('pagehide',()=>sound.stopAll());
function frame(timestamp){
  const elapsed=last?Math.min((timestamp-last)/1000,.15):0;last=timestamp;visualClock+=elapsed;
  if(game.phase==='running'){accumulator+=elapsed*game.simulationRate(speed);while(accumulator>=1/60){const wasPreparing=game.isPreparing();game.step(1/60);accumulator-=1/60;if(game.phase!=='running'||wasPreparing!==game.isPreparing()){accumulator=0;break;}}}else accumulator=0;
  session.tick(timestamp);flushAudio();const menuOpen=$('mainMenu').open;
  if(!menuOpen||!menuPainted){if(timestamp-lastUI>80){updateUI();lastUI=timestamp;}draw();}menuPainted=menuOpen;requestAnimationFrame(frame);
}
setupEconomyUI();
setupHotbar();
setupBulkTools();
const session=setupSessionUI();
ready.then(()=>{resize();updateUI();requestAnimationFrame(frame);}).catch(e=>say(e.message,true));
window.BlueprintDefense={game,sound,camera,actors,ready,session,selectType,reset,updateUI,screen,render:draw,get choice(){return choice;}};
