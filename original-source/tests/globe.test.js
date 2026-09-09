/* Pure timeline tests; canvas rendering is covered separately by browser tests. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={window:{},matchMedia:()=>({matches:false}),devicePixelRatio:1,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},document:{hidden:false}};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require.resolve('../src/globe.js'),'utf8'),sandbox);
const Globe=sandbox.window.GeoGlobe;
const canvas=()=>({getContext:()=>({}),getBoundingClientRect:()=>({width:640,height:480}),addEventListener(){}});
const all=require('../data/countries.json');let scenarios=0;
for(const country of all){
 const g=new Globe(canvas(),[]);let done=0;const stages=[];
 g.reveal(country,{onComplete:()=>done++,onStage:x=>stages.push(x)});const from=g.lon;
 g.update(0);for(let t=100;t<=9000;t+=100)g.update(t);
 assert.ok(g.lon-from>=6*Math.PI-1e-8);assert.equal(g.zoom,.85);assert.equal(g.target,null);
 const rate=g.flight.spinAngle/8400;assert.ok(rate>0);const startSettle=g.lon;
 g.update(9100);assert.ok(g.lon>startSettle);assert.ok(g.lon-startSettle<rate*100);
 for(let t=9200;t<12000;t+=100){g.update(t);assert.equal(done,0);}
 g.update(12000);assert.equal(g.flight,null);assert.equal(done,0,'Callback waits until after paint');
 g.pendingComplete();assert.equal(done,1);assert.equal(g.target,country);assert.ok(Math.abs(g.lat-country.lat*Math.PI/180)<1e-10);
 assert.ok(Math.abs(Math.sin((g.lon-country.lon*Math.PI/180)/2))<1e-8);
 assert.deepEqual(stages,['depart','spin','settle','zoom']);scenarios++;
}
let g=new Globe(canvas(),[]);g.setMotion(false);g.reveal(all[0]);const initial=[g.lat,g.lon,g.zoom];g.update(0);
for(let t=100;t<=11900;t+=100)g.update(t);assert.ok(g.flight);assert.deepEqual([g.lat,g.lon,g.zoom],initial);
g.update(12000);assert.equal(g.flight,null);
g=new Globe(canvas(),[]);g.reveal(all[0],{neutral:true});g.update(0);for(let t=100;t<=12000;t+=100)g.update(t);
assert.equal(g.target,null);assert.ok(Math.abs(g.lat-20*Math.PI/180)<1e-10);assert.equal(g.zoom,1);
g=new Globe(canvas(),[]);g.reveal(all[0]);g.update(0);g.update(100);g.pauseFlight(true);g.update(10000);g.update(10100);assert.equal(g.flight.elapsed,100);
g.pauseFlight(false);g.update(20000);g.update(20100);assert.equal(g.flight.elapsed,200);
g.cancelFlight();g.update(20200);assert.equal(g.flight,null);assert.equal(g.pendingComplete,null);assert.equal(g.locked,false);
console.log(`PASS — ${scenarios} destinations: >=3 uniform full turns, continuous slowdown, stop then zoom, exactly 12,000 ms; neutral bonus, reduced motion, pause and cancellation.`);
