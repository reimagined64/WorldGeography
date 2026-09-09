'use strict';
const assert=require('node:assert/strict'),Core=require('../src/core'),Clock=require('../src/clock'),data=require('../data/countries.json');let checked=0;
for(const difficulty of ['easy','normal','expert']){
 const limit=Core.TIME_LIMITS[difficulty];assert.equal(Core.pointsForTime(0,limit),1000);assert.equal(Core.pointsForTime(limit/2,limit),550);assert.equal(Core.pointsForTime(limit,limit),0);
 let last=Infinity;for(let elapsed=0;elapsed<=limit;elapsed+=10){const score=Core.pointsForTime(elapsed,limit);assert.ok(score<=last);last=score;assert.equal(score%10,0);assert.ok(score>=0&&score<=1000);checked++;}
 const create=()=>Core.makeGame(data,{difficulty,players:2,region:'all',names:['A','B']},7);
 let g=create(),q=g.questions[0],a=Core.submit(g,q.correct,limit/2);assert.deepEqual([a.points,a.basePoints,a.bonusPoints,a.timedOut],[550,100,450,false]);assert.deepEqual(g.scores,[550,0]);assert.equal(Core.submit(g,q.correct,0),null);
 g=create();a=Core.submit(g,null,limit);assert.equal(a.points,0);assert.equal(a.lifeDelta,0);assert.equal(a.timedOut,true);assert.deepEqual(g.lives,[4,5]);
 g=create();assert.throws(()=>Core.submit(g,null,1));assert.throws(()=>Core.submit(g,0,-1));assert.throws(()=>Core.submit(g,0,NaN));
}
assert.equal(Core.pointsForTime(5000,20000),780);assert.equal(Core.pointsForTime(0,0),100);
let now=1000;const clock=new Clock(20000,1000,()=>now);clock.start();now+=1000;assert.equal(clock.elapsed(),2000);clock.pause();now+=100000;assert.equal(clock.elapsed(),2000);clock.start();now+=300;assert.equal(clock.remaining(),17700);
clock.pause();const restored=new Clock(20000,clock.elapsed(),()=>now);assert.equal(restored.remaining(),17700);restored.start();now+=50000;assert.equal(restored.elapsed(),20000);restored.pause().start();assert.equal(restored.running,false);
assert.throws(()=>new Clock(-1));assert.throws(()=>Core.pointsForTime(NaN,1000));
console.log(`PASS — ${checked} monotonic score samples, limits, exact expiry, 5-second reward, pause/resume.`);
