(function(root){
  'use strict';
  class BlueprintCamera{
    constructor(width,height){this.width=width;this.height=height;this.zoom=1;this.cx=width/2;this.cy=height/2;this.w=1;this.h=1;this.min=.5;this.max=4;this.layout();}
    layout(){
      const s=Math.min(this.w/this.width,this.h/this.height)*.95*this.zoom;
      const clampAxis=(offset,extent,viewport)=>extent<=viewport? (viewport-extent)/2:Math.max(viewport-extent-24,Math.min(24,offset));
      const ox=clampAxis(this.w/2-this.cx*s,this.width*s,this.w),oy=clampAxis(this.h/2-this.cy*s,this.height*s,this.h);
      this.cx=(this.w/2-ox)/s;this.cy=(this.h/2-oy)/s;this.view={s,ox,oy,w:this.w,h:this.h};
    }
    resize(w,h){if(w<=0||h<=0)return;this.w=w;this.h=h;this.layout();}
    world(x,y){return {x:(x-this.view.ox)/this.view.s,y:(y-this.view.oy)/this.view.s};}
    setZoom(zoom,x=this.w/2,y=this.h/2){
      if(!Number.isFinite(zoom))return;
      const point=this.world(x,y);this.zoom=Math.max(this.min,Math.min(this.max,zoom));
      const s=Math.min(this.w/this.width,this.h/this.height)*.95*this.zoom;
      this.cx=point.x-(x-this.w/2)/s;this.cy=point.y-(y-this.h/2)/s;this.layout();
    }
    pan(dx,dy){this.cx-=dx/this.view.s;this.cy-=dy/this.view.s;this.layout();}
    reset(){this.zoom=1;this.cx=this.width/2;this.cy=this.height/2;this.layout();}
  }
  if(typeof module==='object'&&module.exports)module.exports=BlueprintCamera;else root.BlueprintCamera=BlueprintCamera;
})(globalThis);
