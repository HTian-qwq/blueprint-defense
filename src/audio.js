(function(root){
  'use strict';
  class SoundBank {
    constructor(cues,onChange=()=>{},worldWidth=20) {
      this.worldWidth=worldWidth;
      this.cues=cues;this.onChange=onChange;this.context=null;this.buffers=new Map();this.voices=new Set();
      this.state='locked';this.volume=.45;this.muted=false;this.pending=null;this.variants=new Map();this.lastPlayed=new Map();
      this.played=0;this.maxVoices=18;this.counts={};this.error='';
      try {const p=JSON.parse(localStorage.getItem('blueprint-defense-audio')||'null');
        if(p&&typeof p.volume==='number'&&Number.isFinite(p.volume))this.volume=Math.max(0,Math.min(1,p.volume));
        if(p&&typeof p.muted==='boolean')this.muted=p.muted;
      }catch(_){}
    }
    save(){try{localStorage.setItem('blueprint-defense-audio',JSON.stringify({volume:this.volume,muted:this.muted}));}catch(_){}this.onChange();}
    async unlock(){
      if(this.muted||this.volume===0)return false;
      try {
        if(!this.context){
          const Context=root.AudioContext||root.webkitAudioContext;if(!Context)throw Error('浏览器不支持音频');
          this.context=new Context();this.master=this.context.createGain();this.master.gain.value=this.volume;
          const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-18;compressor.knee.value=12;
          compressor.ratio.value=8;compressor.attack.value=.004;compressor.release.value=.16;
          compressor.connect(this.master);this.master.connect(this.context.destination);this.input=compressor;
          this.state='loading';this.onChange();
          this.pending=Promise.all(Object.entries(this.cues).map(async([key,uris])=>{
            const buffers=await Promise.all(uris.map(uri=>{
              const bytes=Uint8Array.from(atob(uri.split(',')[1]),c=>c.charCodeAt(0));
              return this.context.decodeAudioData(bytes.buffer);
            }));this.buffers.set(key,buffers);
          }));
        }
        // Called synchronously from a gesture before waiting for decoding.
        const resume=this.context.state==='running'?Promise.resolve():this.context.resume();
        await Promise.all([resume,this.pending]);this.state='ready';this.error='';this.onChange();return true;
      }catch(error){this.state='failed';this.error=String(error.message||error);this.stopAll();this.onChange();return false;}
    }
    setVolume(value){
      if(!Number.isFinite(value))return;
      this.volume=Math.max(0,Math.min(1,value));
      if(this.master)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.context.currentTime,.012);
      if(this.volume===0)this.stopAll();this.save();
    }
    setMuted(value){
      this.muted=!!value;
      if(this.master)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.context.currentTime,.012);
      if(this.muted)this.stopAll();this.save();
    }
    stopVoice(voice){
      this.voices.delete(voice);
      try{const now=this.context.currentTime;voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(0,now,.003);voice.source.stop(now+.012);}catch(_){}
    }
    stopAll(){for(const voice of [...this.voices])this.stopVoice(voice);this.lastPlayed.clear();}
    play(key,x=this.worldWidth/2,voiceId){
      if(this.state!=='ready'||this.context.state!=='running'||this.muted||this.volume===0||document.hidden)return false;
      const variants=this.buffers.get(key);if(!variants?.length)return false;
      const dialogue=key.startsWith('wisadel.');
      const now=this.context.currentTime;if(!dialogue&&now-(this.lastPlayed.get(key)??-Infinity)<.025)return false;
      if(dialogue)for(const voice of [...this.voices])if(voice.dialogue)this.stopVoice(voice);
      this.lastPlayed.set(key,now);
      while(this.voices.size>=this.maxVoices)this.stopVoice([...this.voices].find(v=>!v.dialogue)||this.voices.values().next().value);
      const index=this.variants.get(key)||0;this.variants.set(key,index+1);
      const source=this.context.createBufferSource(),gain=this.context.createGain(),pan=this.context.createStereoPanner();
      source.buffer=variants[index%variants.length];source.playbackRate.value=1;
      gain.gain.value=dialogue?.72:key.includes('.hit')?.22:key.endsWith('.deploy')?.3:.38;
      pan.pan.value=Math.max(-.65,Math.min(.65,(x/this.worldWidth-.5)*1.3));
      source.connect(gain);gain.connect(pan);pan.connect(this.input);
      const voice={source,gain,pan,key,voiceId,dialogue};this.voices.add(voice);
      source.onended=()=>{this.voices.delete(voice);source.disconnect();gain.disconnect();pan.disconnect();};
      source.start();this.played++;this.counts[key]=(this.counts[key]||0)+1;return true;
    }
    consume(events,allowed,time){
      if(!allowed){this.stopAll();return;}
      for(const e of events){
        if(e.stopVoiceId!==undefined)for(const voice of [...this.voices])if(voice.voiceId===e.stopVoiceId)this.stopVoice(voice);
        if(time-e.time<=.15)this.play(e.key,e.x,e.voiceId);
      }
    }
  }
  root.BlueprintSound=SoundBank;
})(globalThis);
