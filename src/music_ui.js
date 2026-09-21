'use strict';
function updateMusicUI(){
  const active=music.enabled&&music.volume>0;
  $('musicBtn').textContent=music.failed&&active?'音乐 · 重试':active?'音乐 · 开':'音乐 · 关';
  $('musicBtn').setAttribute('aria-pressed',String(active));$('musicBtn').title=(active&&music.error)||'原版战斗音乐 · 独立于音效开关';
  $('settingsMusicVolume').value=Math.round(music.volume*100);$('settingsMusicVolumeValue').textContent=Math.round(music.volume*100)+'%';
  $('settingsMusicToggle').textContent=music.enabled?'关闭音乐':'开启音乐';$('settingsMusicToggle').setAttribute('aria-pressed',String(music.enabled));
  $('settingsMusicTrack').value=music.selection;$('settingsMusicRetry').hidden=!music.failed||!active;
  const selected=music.tracks.find(t=>t.id===music.selection),pending=selected&&selected.id!==music.track?.id;
  $('settingsMusicStatus').textContent=!active?'音乐已关闭':pending?selected.title+' · 继续战斗后播放':music.error||(music.track?music.track.title+' · '+(music.state==='playing'?'播放中':music.allowed?'待播放':'已暂停'):'开始战斗后播放');
}
function syncMusic(){
  const tracks=DATA.music?.tracks||[],index=game.boss&&!game.bossOutcome?tracks.length-1:Math.floor(Math.max(0,game.wave)/2)%Math.max(1,tracks.length);
  music.sync(tracks[index]?.id,game.phase==='running'&&!document.hidden&&!$('mainMenu').open,game.isPreparing());
}
function setupMusicUI(){
  for(const track of DATA.music?.tracks||[])$('settingsMusicTrack').add(new Option(track.title,track.id));
  const toggle=()=>{music.gesture();music.setEnabled(!music.enabled);syncMusic();};
  $('musicBtn').onclick=()=>{if(music.failed&&music.enabled&&music.volume>0){music.retry();syncMusic();}else toggle();};$('settingsMusicToggle').onclick=toggle;
  $('settingsMusicVolume').oninput=e=>{music.gesture();music.setVolume(Number(e.target.value)/100);syncMusic();};
  $('settingsMusicTrack').onchange=e=>{music.gesture();music.setSelection(e.target.value);syncMusic();};
  $('settingsMusicRetry').onclick=()=>{music.retry();syncMusic();};
  document.addEventListener('pointerdown',()=>music.gesture(),{capture:true});
  document.addEventListener('keydown',e=>{if(e.isTrusted&&!e.repeat)music.gesture();},{capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)music.pause();});
  window.addEventListener('pagehide',()=>music.pause());
  updateMusicUI();
}
