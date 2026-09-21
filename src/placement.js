(function(root){
  'use strict';
  const dirs=[[1,0],[0,1],[-1,0],[0,-1]],key=p=>`${p.x},${p.y}`;
  const api={
    placedBuildings(){
      return [...this.towers.map(unit=>({unit,production:false,rect:this.towerRect(unit)})),...this.production.filter(unit=>!unit.fixed).map(unit=>({unit,production:true,rect:this.productionRect(unit)}))];
    },
    buildingsInRect(rect){
      return this.placedBuildings().filter(({rect:r})=>r.x<rect.x+rect.width&&r.x+r.width>rect.x&&r.y<rect.y+rect.depth&&r.y+r.depth>rect.y).map(({unit})=>unit.id);
    },
    bulkSelection(ids){
      const wanted=new Set(ids),members=this.placedBuildings().filter(({unit})=>wanted.has(unit.id));
      const error=!wanted.size?'请先选中设备':members.length!==wanted.size?'选中设备已失效或包含固定设施':'';
      const refund=members.reduce((sum,{unit,production})=>sum+(production?this.config.production.types[unit.type].cost:this.refundValue(unit)),0);
      return {members,error,refund,credited:Math.max(0,Math.min(refund,this.dpCapacity()-this.dp))};
    },
    planBulkMove(ids,dx,dy){
      const selection=this.bulkSelection(ids),plan={...selection,dx,dy};if(plan.error)return plan;
      if(!['ready','running','paused'].includes(this.phase))return {...plan,error:'演练已结束，无法移动'};
      if(!Number.isInteger(dx)||!Number.isInteger(dy))return {...plan,error:'请选择战场内的网格'};
      // Every member translates by the same offset. Ignore only their old footprints.
      const ignore=new Set(selection.members.map(({unit})=>unit.id));
      for(const {unit,production} of selection.members){
        const error=production?this.productionPlacementError(unit.type,unit.x+dx,unit.y+dy,unit.dir,ignore):this.footprintError(this.stats(unit),unit.x+dx,unit.y+dy,ignore);
        if(error)return {...plan,error};
      }
      return plan;
    },
    moveBuildings(ids,dx,dy){
      const plan=this.planBulkMove(ids,dx,dy);if(plan.error)return plan;
      for(const {unit} of plan.members){unit.x+=dx;unit.y+=dy;}
      return plan;
    },
    removeBuildings(ids){
      const selection=this.bulkSelection(ids);if(selection.error)return selection;
      if(!['ready','running','paused'].includes(this.phase))return {...selection,error:'演练已结束，无法拆除'};
      const before=this.dp;
      for(const {unit,production} of selection.members)production?this.removeProduction(unit.id):this.withdraw(unit.id);
      return {...selection,credited:this.dp-before,count:selection.members.length};
    },
    placementConnections(p){
      let count=0;const peers=this.production.filter(n=>n.id!==p.id);
      for(const n of peers){if(this.productionPortMatches(n,p))count++;if(this.productionPortMatches(p,n))count++;}
      const side=this.productionPorts(p).warehouse;
      const dock=side!=null&&this.edgeCells(p,side).every(c=>{const [dx,dy]=dirs[side];return this.warehouseLine.some(n=>this.productionContains(n,c.x+dx,c.y+dy));});
      return {count,dock};
    },
    suggestProduction(type,x,y,dir,{snap=true,rotate=true,ignoreId}={}){
      const base={type,x,y,dir,id:ignoreId},d=this.config.production.types[type];
      if(!d)return {...base,count:0,dock:false,snapped:false};
      if(!snap||d.kind==='belt')return {...base,...this.placementConnections(base),snapped:false};
      let best=base,bestScore=-Infinity;
      // Stay within one cell of the requested anchor. Prefer exact alignment
      // over extra connections farther away; explicit R rotation is respected.
      for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])for(const turn of rotate?[dir,(dir+1)%4,(dir+2)%4,(dir+3)%4]:[dir]){
        const p={...base,x:x+dx,y:y+dy,dir:turn};
        if(this.productionPlacementError(type,p.x,p.y,turn,ignoreId,true))continue;
        const c=this.placementConnections(p);if(!c.count&&!c.dock)continue;
        const score=(c.dock?50:0)+Math.min(c.count,3)*10-(Math.abs(dx)+Math.abs(dy))*12-(turn===dir?0:.1);
        if(score>bestScore){best=p;bestScore=score;}
      }
      return {...best,...this.placementConnections(best),snapped:best.x!==x||best.y!==y||best.dir!==dir};
    },
    moveError(id,x,y,dir){
      if(!['ready','running','paused'].includes(this.phase))return '演练已结束，无法移动';
      const t=this.towers.find(t=>t.id===id);if(t)return this.footprintError(this.stats(t),x,y,id);
      const p=this.production.find(p=>p.id===id);if(p)return this.productionPlacementError(p.type,x,y,dir??p.dir,id);
      return '固定设施不能移动';
    },
    moveBuilding(id,x,y,dir){
      const error=this.moveError(id,x,y,dir);if(error)return {error};
      const unit=this.towers.find(t=>t.id===id)||this.production.find(p=>p.id===id);
      unit.x=x;unit.y=y;if(unit.dir!=null)unit.dir=dir??unit.dir;
      return {unit};
    },
    planBeltPath(cells,endDir){
      const type=this.config.production.types.findIndex(d=>d.kind==='belt'),seen=new Set(),path=[];
      if(!cells.length||type<0)return {error:'请选择传送带起点',path,cost:0};
      if(!['ready','running','paused'].includes(this.phase))return {error:'演练已结束',path,cost:0};
      for(let i=0;i<cells.length;i++){
        const c=cells[i];if(seen.has(key(c))||i&&Math.abs(c.x-cells[i-1].x)+Math.abs(c.y-cells[i-1].y)!==1)return {error:'传送带必须连续且不能自交',path,cost:0};seen.add(key(c));
        const next=cells[i+1],prev=cells[i-1],existing=this.productionAt(c.x,c.y);
        let dir=next?dirs.findIndex(([dx,dy])=>c.x+dx===next.x&&c.y+dy===next.y):endDir??(prev?dirs.findIndex(([dx,dy])=>prev.x+dx===c.x&&prev.y+dy===c.y):existing?.dir??3);
        if(i===cells.length-1&&endDir==null){
          const remaining=new Set(cells.map(key));
          for(const candidate of [dir,(dir+1)%4,(dir+3)%4,(dir+2)%4]){
            const [dx,dy]=dirs[candidate],n=this.productionAt(c.x+dx,c.y+dy);
            if(n&&!remaining.has(key({x:c.x+dx,y:c.y+dy}))&&this.productionPortMatches({...c,type,dir:candidate},n)){dir=candidate;break;}
          }
        }
        const reusable=existing&&existing.type===type&&!existing.fixed;
        path.push({...c,type,dir,id:reusable?existing.id:undefined});
      }
      const cost=path.filter(p=>p.id==null).length*this.config.production.types[type].cost;
      for(const p of path){const error=this.productionPlacementError(type,p.x,p.y,p.dir,p.id,true);if(error)return {error,path,cost};}
      if(this.dp+1e-8<cost)return {error:'折金票不足，整段未铺设',path,cost};
      return {path,cost,error:''};
    },
    deployBeltPath(cells,endDir){
      const plan=this.planBeltPath(cells,endDir);if(plan.error)return plan;
      // Validate the whole route first; no partial spending or partially built paths.
      for(const p of plan.path){
        if(p.id!=null)this.production.find(n=>n.id===p.id).dir=p.dir;
        else this.deployProduction(p.type,p.x,p.y,p.dir);
      }
      return plan;
    }
  };
  if(typeof module==='object'&&module.exports)module.exports=api;else root.BlueprintPlacement=api;
})(globalThis);
