'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Core=require('../src/core'),Sim=require('./simulate'),all=require('../data/countries.json');
let scoringSamples=0;
for(const limit of Object.values(Core.TIME_LIMITS))for(let elapsed=0;elapsed<=limit;elapsed+=7){
 const original=elapsed>=limit?0:100+Math.round(90*(1-elapsed/limit))*10;
 assert.equal(Core.pointsForTime(elapsed,limit),original);scoringSamples++;
}
assert.equal(Core.MILESTONE_LIVES,2);assert.equal(Core.BASE_POINTS,100);assert.equal(Core.MAX_POINTS,1000);
assert.ok(Math.abs(Sim.averagePoints({timeRangeMs:[1000,5000]})-865)<1e-9);
assert.ok(Sim.expectation({elapsedMs:5000}).netReservePerCountry<0);
assert.ok(Sim.expectation({elapsedMs:3000}).netReservePerCountry>0);
let comparisons=0,totalAnswers=0;
for(const timeRangeMs of [null,[1000,5000]])for(let run=0;run<24;run++){
 const seed=710071+run,cap=150,elapsedMs=5000,settings={seed,trials:1,capCountries:cap,elapsedMs,timeRangeMs};
 const reduced=Sim.simulate(settings),random=Core.rng(seed),g=Core.makeGame(all,{players:1,difficulty:'normal',region:'all',names:['Test']},seed);
 let countries=1,flags=0,flagCorrect=0,regulars=0,regularCorrect=0;
 while(!g.completed){
  const q=g.questions[g.index],correct=random()<.8;
  // Timing randomness is independent of correctness; omitted for wrong answers
  // in both models because it affects neither score nor country/bonus ordering.
  const elapsed=correct&&timeRangeMs?timeRangeMs[0]+random()*(timeRangeMs[1]-timeRangeMs[0]):elapsedMs;
  Core.submit(g,correct?q.correct:(q.correct+1)%3,elapsed);
  if(q.type==='flag'){flags++;if(correct)flagCorrect++;}else{regulars++;if(correct)regularCorrect++;}
  if(countries===cap&&Core.nextTurn(g).kind==='country')break;
  if(!Core.advance(g,all))break;
  if(g.questions[g.index].type==='country')countries++;
 }
 assert.equal(g.scores[0],reduced.totalScore);assert.equal(g.lives[0],reduced.totalReserve);
 assert.equal(countries,reduced.totalCountries);assert.equal(flags,reduced.flagAnswers);assert.equal(flagCorrect,reduced.flagCorrect);
 assert.equal(regulars,reduced.regularAnswers);assert.equal(regularCorrect,reduced.regularCorrect);
 assert.equal(g.scoreLives[0],reduced.scoreAttemptAwards);assert.ok(Core.validateProgress(g));
 comparisons++;totalAnswers+=g.answers.length;
}
const report={version:7,originalScoringSamples:scoringSamples,fullEngineVsSimulatorComparisons:comparisons,totalAnswers,uniformMeanCorrectPoints:865};
fs.writeFileSync(path.join(__dirname,'simulation-test-results.json'),JSON.stringify(report,null,2));
console.log('PASS — '+JSON.stringify(report));
