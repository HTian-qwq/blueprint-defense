(function(root){
  'use strict';
  class MusicPlayer {
    constructor(tracks,onChange=()=>{}){
      this.tracks=tracks;this.onChange=onChange;this.enabled=true;this.volume=.25;this.selection='auto';
      this.audio=new Audio();this.audio.preload='none';this.audio.loop=true;
      this.track=null;this.state='idle';this.error='';this.allowed=false;this.quiet=false;this.unlocked=false;
      this.pending=null;this.generation=0;this.failed=false;
      try{const prefs=JSON.parse(localStorage.getItem('blueprint-defense-music')||'null');
        if(typeof prefs?.enabled==='boolean')this.enabled=prefs.enabled;
        if(Number.isFinite(prefs?.volume))this.volume=Math.max(0,Math.min(1,prefs.volume));
        if(prefs?.selection==='auto'||tracks.some(t=>t.id===prefs?.selection))this.selection=prefs.selection;
      }catch(_){}
      this.audio.addEventListener('error',()=>{if(this.track){this.failed=true;this.error='音乐加载失败，点击重试';this.state='failed';this.onChange();}});
      this.applyVolume();
    }
    save(){try{localStorage.setItem('blueprint-defense-music',JSON.stringify({enabled:this.enabled,volume:this.volume,selection:this.selection}));}catch(_){}this.onChange();}
    applyVolume(){this.audio.volume=this.volume*(this.quiet?.5:1);this.audio.playbackRate=1;}
    setVolume(value){if(!Number.isFinite(value))return;this.volume=Math.max(0,Math.min(1,value));this.applyVolume();if(!this.volume)this.pause();else this.play();this.save();}
    setEnabled(value){this.enabled=!!value;if(!this.enabled)this.pause();else this.play();this.save();}
    setSelection(value){if(value!=='auto'&&!this.tracks.some(t=>t.id===value))return;this.selection=value;this.save();}
    gesture(){this.unlocked=true;if(this.state==='blocked')this.state='paused';this.play();}
    sync(automaticId,allowed,quiet=false){
      this.allowed=!!allowed;this.quiet=!!quiet;this.applyVolume();
      const target=this.tracks.find(t=>t.id===(this.selection==='auto'?automaticId:this.selection))||this.tracks[0];
      if(!this.allowed||!this.enabled||!this.volume||!target){this.pause();return;}
      if(this.track?.id!==target.id){
        this.pause();this.track=target;this.failed=false;this.error='';this.audio.src=target.src;this.state='paused';this.onChange();
      }
      this.play();
    }
    play(){
      if(!this.track||!this.allowed||!this.enabled||!this.volume||!this.unlocked||this.failed||this.state==='blocked'||document.hidden||this.pending||!this.audio.paused)return;
      const token=++this.generation;this.state='loading';this.onChange();
      const task=this.audio.play();this.pending=task;
      Promise.resolve(task).then(()=>{
        if(token!==this.generation)return;
        this.state='playing';this.error='';this.onChange();
      }).catch(error=>{
        if(token!==this.generation)return;
        this.state=error.name==='NotAllowedError'?'blocked':'failed';this.failed=this.state==='failed';
        this.error=this.failed?'音乐加载失败，点击重试':'点击页面启用音乐';this.onChange();
      }).finally(()=>{if(this.pending===task)this.pending=null;});
    }
    pause(){
      if(this.pending||!this.audio.paused){this.generation++;this.audio.pause();this.pending=null;}
      if(['playing','loading'].includes(this.state)){this.state='paused';this.onChange();}
    }
    retry(){this.generation++;this.pending=null;this.audio.pause();this.failed=false;this.error='';this.state='paused';this.unlocked=true;if(this.track)this.audio.load();this.play();this.onChange();}
    reset(){this.pause();try{this.audio.currentTime=0;}catch(_){}this.allowed=false;}
  }
  root.BlueprintMusic=MusicPlayer;
})(globalThis);
