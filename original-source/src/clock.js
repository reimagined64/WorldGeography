/* Monotonic, pausable per-question clock. No wall-clock drift or setInterval counting. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();else root.GeoClock=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
return class GeoClock {
  constructor(limitMs,elapsedMs=0,now=()=>performance.now()){
    if(!Number.isFinite(limitMs)||limitMs<0||!Number.isFinite(elapsedMs)||elapsedMs<0)throw new RangeError('Neplatný čas.');
    this.limitMs=limitMs;this.accumulated=limitMs?Math.min(limitMs,elapsedMs):elapsedMs;this.now=now;this.running=false;this.startedAt=0;
  }
  elapsed(){return Math.min(this.limitMs||Infinity,this.accumulated+(this.running?Math.max(0,this.now()-this.startedAt):0));}
  remaining(){return this.limitMs?Math.max(0,this.limitMs-this.elapsed()):Infinity;}
  start(){if(!this.running&&(!this.limitMs||this.accumulated<this.limitMs)){this.startedAt=this.now();this.running=true;}return this;}
  pause(){this.accumulated=this.elapsed();this.running=false;return this;}
};
});
