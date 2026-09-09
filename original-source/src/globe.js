/* Orthographic canvas globe. All map geometry is embedded; no tiles or tracking. */
(function(root){
'use strict';
const RAD=Math.PI/180,TAU=Math.PI*2;
const FLIGHT=Object.freeze({depart:600,spin:8400,settle:1800,zoom:1200,total:12000,turns:3});
class Globe {
  constructor(canvas,polygons){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.polys=polygons.map(p=>({...p,vec:p.points.map(([lon,lat])=>{const f=lat*RAD,l=lon*RAD;return [Math.cos(f)*Math.sin(l),Math.sin(f),Math.cos(f)*Math.cos(l)];})}));
    this.lat=20*RAD;this.lon=12*RAD;this.targetLat=this.lat;this.targetLon=this.lon;
    this.zoom=1;this.targetZoom=1;this.target=null;this.idle=true;this.drag=false;this.motion= !matchMedia('(prefers-reduced-motion: reduce)').matches;this.lastFrame=0;this.previousTick=null;this.flight=null;this.locked=false;this.pendingComplete=null;
    this.resize=()=>{const r=canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);this.dpr=d;};
    this.observer=new ResizeObserver(this.resize);this.observer.observe(canvas);this.resize();
    canvas.addEventListener('pointerdown',e=>{if(this.locked)return;this.drag=true;this.idle=false;this.prev=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.targetLon-=(e.clientX-this.prev[0])*.005/this.zoom;this.targetLat=Math.max(-1.4,Math.min(1.4,this.targetLat+(e.clientY-this.prev[1])*.005/this.zoom));this.prev=[e.clientX,e.clientY];});
    const stop=()=>{this.drag=false;};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
    canvas.addEventListener('wheel',e=>{if(this.locked||e.ctrlKey||e.metaKey)return;e.preventDefault();this.setZoom(this.targetZoom-e.deltaY*.001);},{passive:false});
    this.frame=(t)=>{if(!document.hidden&&t-this.lastFrame>30){this.lastFrame=t;this.update(t);this.draw(t);if(this.pendingComplete){const done=this.pendingComplete;this.pendingComplete=null;done();}}this.raf=requestAnimationFrame(this.frame);};
    this.raf=requestAnimationFrame(this.frame);
  }
  setZoom(z){if(this.locked)return;this.targetZoom=Math.max(.85,Math.min(2.6,z));}
  focus(c,idle=false){this.cancelFlight();this.target=c;this.idle=idle;if(c){this.targetLat=c.lat*RAD;let l=c.lon*RAD;while(l-this.lon>Math.PI)l-=TAU;while(l-this.lon< -Math.PI)l+=TAU;this.targetLon=l;}this.targetZoom=1;}
  present(c){
    this.focus(c);this.idle=false;
    if(c)this.targetZoom=this.zoomFor(c);
    else{this.targetLat=20*RAD;this.targetLon=12*RAD;this.targetZoom=1;}
    this.lat=this.targetLat;this.lon=this.targetLon;this.zoom=this.targetZoom;
  }
  home(){this.cancelFlight();this.target=null;this.idle=true;this.targetLat=20*RAD;this.targetZoom=1;}
  reset(){if(this.locked)return;if(this.target)this.focus(this.target);else{this.targetLat=20*RAD;this.targetLon=12*RAD;this.targetZoom=1;}}
  zoomFor(c){
    // Fit the main landmass; far-away overseas polygons must not prevent a useful zoom.
    const latitude=c.lat*RAD,longitude=c.lon*RAD;
    const distances=this.polys.filter(p=>p.iso3===c.iso3).flatMap(p=>p.points.map(([lon,lat])=>{
      const phi=lat*RAD,lambda=lon*RAD;
      return Math.acos(Math.max(-1,Math.min(1,Math.sin(latitude)*Math.sin(phi)+Math.cos(latitude)*Math.cos(phi)*Math.cos(lambda-longitude))));
    })).filter(a=>a<1.35).sort((a,b)=>a-b);
    const span=distances.length?distances[Math.floor((distances.length-1)*.92)]:.06;
    return Math.max(1.22,Math.min(2.45,.62/Math.max(.08,Math.sin(span))));
  }
  setMotion(enabled){this.motion=!!enabled;}
  reveal(c,{onStage=()=>{},onProgress=()=>{},onComplete=()=>{},neutral=false}={}){
    this.cancelFlight();this.idle=false;this.drag=false;this.locked=true;this.target=null;
    // The bonus uses a neutral viewpoint: the map must not reveal the flag's owner.
    const destination=neutral?{lat:20,lon:12}:c;
    let extra=((destination.lon*RAD-this.lon)%TAU+TAU)%TAU;
    // Reserve enough angle for a physically continuous slowdown after >=3 turns.
    const ratio=FLIGHT.spin/(FLIGHT.spin+FLIGHT.settle/2);
    if((FLIGHT.turns*TAU+extra)*ratio<FLIGHT.turns*TAU)extra+=TAU;
    const distance=FLIGHT.turns*TAU+extra,spinAngle=distance*ratio;
    this.flight={country:c,destination,neutral,spinAngle,elapsed:0,paused:false,stage:'',fromLat:this.lat,fromLon:this.lon,fromZoom:this.zoom,endLon:this.lon+FLIGHT.turns*TAU+extra,endZoom:neutral?1:this.zoomFor(c),onStage,onProgress,onComplete};
    this.previousTick=null;
  }
  pauseFlight(paused){if(this.flight){this.flight.paused=paused;this.previousTick=null;}}
  cancelFlight(){this.flight=null;this.pendingComplete=null;this.locked=false;this.targetLat=this.lat;this.targetLon=this.lon;this.targetZoom=this.zoom;}
  flightState(){
    const f=this.flight;if(!f)return null;
    return {stage:f.stage,elapsed:f.elapsed,paused:f.paused,progress:Math.min(1,f.elapsed/FLIGHT.total),remainingMs:Math.max(0,FLIGHT.total-f.elapsed),durationMs:FLIGHT.total,turnsCompleted:Math.max(0,Math.min(FLIGHT.turns,Math.floor(Math.max(0,Math.min(1,(f.elapsed-FLIGHT.depart)/FLIGHT.spin))*f.spinAngle/TAU))),motion:this.motion,neutral:f.neutral};
  }
  update(t){
    const dt=this.previousTick===null?0:Math.max(0,Math.min(100,t-this.previousTick));this.previousTick=t;
    const f=this.flight;
    if(f){
      if(!f.paused)f.elapsed+=dt;
      const smooth=x=>x*x*(3-2*x),easeOut=x=>1-Math.pow(1-x,3);
      const spinEnd=FLIGHT.depart+FLIGHT.spin,settleEnd=spinEnd+FLIGHT.settle;
      let stage,done=f.elapsed>=FLIGHT.total;
      if(f.elapsed<FLIGHT.depart){
        stage='depart';const u=smooth(f.elapsed/FLIGHT.depart);
        if(this.motion){this.zoom=f.fromZoom+(.85-f.fromZoom)*u;this.lat=f.fromLat+(20*RAD-f.fromLat)*u;}
      }else if(f.elapsed<spinEnd){
        stage='spin';const u=(f.elapsed-FLIGHT.depart)/FLIGHT.spin;
        if(this.motion){
          // Uniform angular speed for at least three turns, then a continuous slowdown.
          this.lon=f.fromLon+f.spinAngle*u;this.lat=20*RAD;this.zoom=.85;
        }
      }else if(f.elapsed<settleEnd){
        stage='settle';const u=(f.elapsed-spinEnd)/FLIGHT.settle;
        if(this.motion){this.lon=f.fromLon+f.spinAngle+(f.endLon-f.fromLon-f.spinAngle)*(2*u-u*u);this.lat=20*RAD+(f.destination.lat*RAD-20*RAD)*smooth(u);this.zoom=.85;}
      }else{
        stage='zoom';const u=smooth(Math.min(1,(f.elapsed-settleEnd)/FLIGHT.zoom));
        if(this.motion||done){this.lon=f.endLon;this.lat=f.destination.lat*RAD;this.zoom=this.motion?.85+(f.endZoom-.85)*u:f.endZoom;this.target=f.neutral?null:f.country;}
      }
      // Reduced motion removes movement, never the 12-second breathing interval.
      this.targetLat=this.lat;this.targetLon=this.lon;this.targetZoom=this.zoom;
      if(stage!==f.stage){f.stage=stage;f.onStage(stage);}
      f.onProgress(this.flightState());
      if(done){this.flight=null;this.locked=false;this.pendingComplete=f.onComplete;}
    }else{
      if(this.idle&&this.motion&&!this.drag)this.targetLon+=dt*.000039;
      const speed=this.motion?1-Math.pow(.87,dt/33):1;
      this.lat+=(this.targetLat-this.lat)*speed;this.lon+=(this.targetLon-this.lon)*speed;this.zoom+=(this.targetZoom-this.zoom)*speed;
    }
    const sl=Math.sin(this.lon),cl=Math.cos(this.lon),sp=Math.sin(this.lat),cp=Math.cos(this.lat);
    this.rot=v=>{const x=v[0]*cl-v[2]*sl,z=v[0]*sl+v[2]*cl;return [x,-(v[1]*cp-z*sp),v[1]*sp+z*cp];};
  }
  point(lon,lat){const f=lat*RAD,l=lon*RAD;return this.rot([Math.cos(f)*Math.sin(l),Math.sin(f),Math.cos(f)*Math.cos(l)]);}
  intersect(a,b){const t=a[2]/(a[2]-b[2]),x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;const n=Math.hypot(x,y)||1;return[x/n,y/n,0];}
  landPath(vec,r){
    const ctx=this.ctx,pts=vec.map(this.rot),visible=pts.findIndex(p=>p[2]>=0);if(visible<0)return false;
    const ordered=[...pts.slice(visible),...pts.slice(0,visible),pts[visible]];
    ctx.beginPath();ctx.moveTo(ordered[0][0]*r,ordered[0][1]*r);let exit=null;
    for(let i=1;i<ordered.length;i++){
      const a=ordered[i-1],b=ordered[i];
      if(a[2]>=0&&b[2]>=0)ctx.lineTo(b[0]*r,b[1]*r);
      else if(a[2]>=0){exit=this.intersect(a,b);ctx.lineTo(exit[0]*r,exit[1]*r);}
      else if(b[2]>=0){const enter=this.intersect(a,b);if(exit){const start=Math.atan2(exit[1],exit[0]),end=Math.atan2(enter[1],enter[0]);let diff=end-start;while(diff>Math.PI)diff-=TAU;while(diff< -Math.PI)diff+=TAU;ctx.arc(0,0,r,start,start+diff,diff<0);}else ctx.lineTo(enter[0]*r,enter[1]*r);ctx.lineTo(b[0]*r,b[1]*r);exit=null;}
    }ctx.closePath();return true;
  }
  line(coords,r){const ctx=this.ctx;ctx.beginPath();let last=null;for(const [lon,lat]of coords){const p=this.point(lon,lat);if(p[2]>=0){if(!last||last[2]<0)ctx.moveTo(p[0]*r,p[1]*r);else ctx.lineTo(p[0]*r,p[1]*r);}last=p;}ctx.stroke();}
  draw(t){
    if(!this.w||!this.h||!this.rot)return;
    const ctx=this.ctx,w=this.w,h=this.h;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,w,h);
    const r=Math.min(w*.405,h*.407)*this.zoom,cx=w/2,cy=h*.51;this.radius=r;ctx.save();ctx.translate(cx,cy);
    // Atmospheric rim and instrument rings.
    const glow=ctx.createRadialGradient(0,0,r*.94,0,0,r*1.16);glow.addColorStop(0,'rgba(140,190,181,.15)');glow.addColorStop(1,'rgba(140,190,181,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r*1.16,0,TAU);ctx.fill();
    ctx.strokeStyle='rgba(177,193,181,.16)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r*1.10,0,TAU);ctx.stroke();
    for(let a=0;a<360;a+=5){const d=a*RAD;ctx.beginPath();ctx.moveTo(Math.sin(d)*r*1.1,Math.cos(d)*r*1.1);ctx.lineTo(Math.sin(d)*r*(a%30===0?1.13:1.112),Math.cos(d)*r*(a%30===0?1.13:1.112));ctx.stroke();}
    const sea=ctx.createRadialGradient(-r*.35,-r*.45,r*.05,0,0,r*1.08);sea.addColorStop(0,'#21454b');sea.addColorStop(.7,'#14343b');sea.addColorStop(1,'#09252e');ctx.fillStyle=sea;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();
    ctx.save();ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.clip();
    ctx.strokeStyle='rgba(158,188,177,.17)';ctx.lineWidth=.7;
    for(let lat=-75;lat<=75;lat+=15){const a=[];for(let lon=-180;lon<=180;lon+=3)a.push([lon,lat]);this.line(a,r);}
    for(let lon=-180;lon<180;lon+=15){const a=[];for(let lat=-90;lat<=90;lat+=3)a.push([lon,lat]);this.line(a,r);}
    this.polys.forEach((p,i)=>{
      if(!this.landPath(p.vec,r))return;
      const target=this.target&&p.iso3===this.target.iso3;
      ctx.fillStyle=target?'#ed9476':['#99b4a3','#a3bca9','#91ad9f','#abc1af'][i%4];ctx.fill();ctx.strokeStyle=target?'#ffd4ba':'#456a67';ctx.lineWidth=target?1.5:.6;ctx.stroke();
    });
    const shade=ctx.createLinearGradient(-r,-r,r,r*.3);shade.addColorStop(0,'rgba(250,239,207,.04)');shade.addColorStop(.55,'rgba(4,17,24,0)');shade.addColorStop(1,'rgba(2,13,23,.4)');ctx.fillStyle=shade;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore();
    ctx.strokeStyle='rgba(202,222,207,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.stroke();
    if(this.target){const p=this.point(this.target.lon,this.target.lat);if(p[2]>.01){const x=p[0]*r,y=p[1]*r;const pulse=this.motion?(Math.sin(t/420)+1)*3:2;ctx.strokeStyle='rgba(255,210,173,.8)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,10+pulse,0,TAU);ctx.stroke();ctx.fillStyle='#ffb18b';ctx.beginPath();ctx.arc(x,y,4.5,0,TAU);ctx.fill();ctx.strokeStyle='#10242a';ctx.lineWidth=2;ctx.stroke();}}
    ctx.fillStyle='#8faaa5';ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';if(this.zoom<1.2){ctx.fillText('N',0,-r*1.19);ctx.fillText('S',0,r*1.18);}
    ctx.restore();
  }
  destroy(){cancelAnimationFrame(this.raf);this.observer.disconnect();}
}
Globe.FLIGHT=FLIGHT;
root.GeoGlobe=Globe;
})(window);
