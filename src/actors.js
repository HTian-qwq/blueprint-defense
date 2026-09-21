(function(root){
  'use strict';
  function pose(manifest,t,time){
    const clips=manifest.animations,attacks=['attackA','attackB','attackC','special'];let name='idle',age=Math.max(0,time-t.animationStart),loop=true;
    const attack=attacks[Math.max(0,t.shots-1)%attacks.length],shotAge=time-t.lastShotAt;
    if(t.disabledUntil>time){name='stun';age=Math.max(0,time-(t.disabledSince??t.animationStart));}
    // Preparation and an upgrade while paused must show the character even
    // though the supplied entrance recording begins with empty frames.
    else if(t.shots===0&&time<=t.animationStart){name='idle';age=0;}
    else if(t.shots>0&&t.lastShotAt>=t.disabledUntil&&shotAge>=0&&shotAge<clips[attack].duration){name=attack;age=shotAge;loop=false;}
    else if(t.disabledUntil>0&&time-t.disabledUntil<clips.recover.duration){name='recover';age=time-t.disabledUntil;loop=false;}
    else if(t.shots===0&&age<clips.start.duration){name='start';loop=false;}
    else if(t.shots===0&&age<clips.start.duration+clips.begin.duration){name='begin';age-=clips.start.duration;loop=false;}
    const clip=clips[name],n=Math.floor(age*clip.fps+1e-8),frame=loop?n%clip.frames:Math.min(clip.frames-1,n),page=clip.pages.find(p=>frame>=p.start&&frame<p.start+p.count);
    return {name,clip,page,frame,index:frame-page.start};
  }
  class Actors{
    constructor(manifest,{lazy=false}={}){
      this.manifest=manifest;this.images=new Map();this.pending=null;this.retryAt=0;
      this.ready=lazy?Promise.resolve():this.load();
    }
    load(){
      if(this.pending)return this.pending;
      this.pending=Promise.all(Object.values(this.manifest.animations).flatMap(c=>c.pages).filter(p=>!this.images.has(p.file)).map(p=>new Promise((resolve,reject)=>{
        const img=new Image();img.onload=()=>{this.images.set(p.file,img);resolve();};img.onerror=()=>reject(Error('动画加载失败：'+p.file));img.src=p.image;
      }))).catch(error=>{this.pending=null;this.retryAt=Date.now()+5000;throw error;});
      return this.pending;
    }
    draw(ctx,t,time,p,cell,footprint){
      const state=pose(this.manifest,t,time),{clip,page,index}=state,img=this.images.get(page.file);if(!img){if(Date.now()>=this.retryAt)void this.load().catch(()=>{});return false;}
      const scale=footprint.width*cell*.8/this.manifest.bodyWidth,anchor=this.manifest.anchor;
      const x=(clip.box[0]-anchor[0])*scale,y=(clip.box[1]-anchor[1])*scale;
      // Mirror around the registered foot, not the varying action crop, so
      // switching targets never moves the character or flips platform labels.
      ctx.save();ctx.translate(p.x+footprint.width*cell*.5,p.y+footprint.depth*cell*.88);ctx.scale(t.facing===-1?-1:1,1);
      ctx.drawImage(img,(index%page.columns)*clip.width,Math.floor(index/page.columns)*clip.height,clip.width,clip.height,x,y,clip.width*scale,clip.height*scale);ctx.restore();return true;
    }
  }
  if(typeof module==='object'&&module.exports)module.exports={pose};else{root.BlueprintActors=Actors;root.BlueprintActorPose=pose;}
})(globalThis);
