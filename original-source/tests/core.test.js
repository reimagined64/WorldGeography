'use strict';
const assert=require('node:assert/strict'),Core=require('../src/core'),all=require('../data/countries.json'),flags=require('../data/flags.json');
const by=Object.fromEntries(all.map(c=>[c.code,c]));
const create=(extra={},seed=777)=>Core.makeGame(all,{players:1,difficulty:'normal',region:'all',names:['Anna','Petr'],...extra},seed);
const current=g=>g.questions[g.index];
const answer=(g,correct=true,elapsed=5000)=>Core.submit(g,correct?current(g).correct:(current(g).correct+1)%3,elapsed);
const step=(g,correct=true,elapsed=5000)=>{const a=answer(g,correct,elapsed);Core.advance(g,all);return a;};
let checked=0,configurations=0;
assert.equal(Core.validateCountries(all),true);assert.equal(all.length,195);assert.equal(Object.keys(flags).length,195);
assert.equal(Core.currencyLabel({code:'MAD'}),'dirham');assert.equal(by.MA.currencyNames[0].name,'marocký dirham');
const dataBefore=JSON.stringify(all);
for(const difficulty of ['easy','normal','expert'])for(let seed=0;seed<4;seed++)for(const c of all)for(const type of [...Core.TYPES,'flag']){
 const q=Core.makeQuestion(c,type,all,difficulty,Core.rng(seed));
 assert.equal(q.options.length,3);assert.equal(new Set(q.options).size,3);assert.ok(q.correct>=0&&q.correct<3);assert.ok(q.explanation);
 if(type==='currency'){
   const valid=new Set(c.currencyNames.map(Core.currencyLabel));
   q.options.forEach((option,i)=>{assert.equal(valid.has(option),i===q.correct);assert.ok(!/[A-Z]| · |\(|\)/.test(option));assert.ok(Object.values(Core.CURRENCY_UNITS).includes(option));});
   assert.ok(c.currencyNames.every(n=>q.explanation.includes(n.name)&&q.explanation.includes(n.code)));
 }
 if(type==='flag')q.options.forEach((name,i)=>{if(i!==q.correct)assert.ok(!Core.sameFlagFamily(c.code,all.find(c=>c.name===name).code));});
 if(type==='population')assert.equal(q.options[q.correct],Core.populationLabel(c.population));
 checked++;
}
assert.equal(JSON.stringify(all),dataBefore);
assert.equal(Core.makeQuestion(by.CZ,'currency',all).options.filter(x=>x==='koruna').length,1);
assert.equal(Core.makeQuestion(by.US,'currency',all).options.filter(x=>x==='dolar').length,1);
for(const difficulty of ['easy','normal','expert'])for(const region of ['all',...Object.keys(Core.REGIONS)])for(const players of [1,2]){
 const g=create({difficulty,region,players}),h=create({difficulty,region,players});assert.deepEqual(g.questions,h.questions);
 assert.equal(g.version,7);assert.deepEqual(g.lives,players===1?[4]:[4,5]);assert.equal(Core.advance(g,all),false);
 const paid=Array(players).fill(0),bonusWon=Array(players).fill(0);
 for(let i=0;i<130;i++){
   const q=current(g);assert.ok(region==='all'||by[q.country].region===region);
   assert.ok(difficulty!=='easy'||by[q.country].easy);
   assert.equal(Core.needsFlight(g),q.type==='country'||q.type==='flag');
   if(q.type==='country'){paid[q.player]++;assert.equal(q.countryCost,1);}
   if(q.type==='flag'){assert.equal(g.questions[q.regularIndex].type,'population');assert.equal(g.questions[q.regularIndex].visit,q.visit);bonusWon[q.player]++;}
   const a=answer(g,true,0),copy=JSON.stringify(g);assert.equal(Core.submit(g,q.correct,0),null);assert.equal(JSON.stringify(g),copy);
   assert.equal(a.points,1000);assert.equal(a.lifeDelta,a.scoreLifeDelta+a.flagLifeDelta);
   for(let p=0;p<players;p++)assert.equal(g.lives[p],5-paid[p]+2*Math.floor(g.scores[p]/10000)+bonusWon[p]);
   if(i%15===0)assert.ok(Core.validateProgress(g));
   assert.equal(Core.advance(g,all),true);
 }
 assert.ok(Core.validateProgress(g));configurations++;
}
// All wrong: five countries / 25 questions, not five answers. The paid last
// country remains playable even though the reserve has already reached zero.
let g=create();for(let i=0;i<25;i++){
 const before=g.lives[0],q=current(g),a=answer(g,false);
 assert.equal(a.lifeDelta,0);assert.equal(g.lives[0],before);assert.equal(before,4-Math.floor(i/5));
 assert.equal(g.gameOver,i===24);assert.equal(Core.advance(g,all),i<24);
}
assert.ok(g.completed&&g.gameOver);assert.equal(g.questions.length,25);assert.ok(Core.validateProgress(g));
// Timed-out regular questions also do not debit attempts.
g=create();for(let i=0;i<5;i++){const a=Core.submit(g,null,20000);assert.equal(a.lifeDelta,0);assert.equal(g.lives[0],4);if(i<4)Core.advance(g,all);}Core.advance(g,all);assert.equal(g.lives[0],3);
// A milestone credits two immediate attempts, without interrupting the country.
g=create();for(let i=0;i<12;i++)step(g);assert.equal(g.scores[0],9360);assert.equal(current(g).type,'currency');
let a=answer(g);assert.deepEqual(a.milestoneThresholds,[10000]);assert.equal(a.scoreLifeDelta,2);assert.equal(g.lives[0],4);
assert.equal(Core.nextTurn(g).kind,'question');assert.deepEqual(g.pendingBonuses,[[10000]]);assert.ok(Core.validateProgress(g));
const saved=JSON.parse(JSON.stringify(g));Core.advance(g,all);Core.advance(saved,all);assert.deepEqual(g,saved);
for(let i=0;i<2;i++)step(g);assert.equal(current(g).type,'flag');assert.equal(g.scores[0],11700);assert.equal(Core.needsFlight(g),true);
const before=g.lives[0],scoreBefore=g.scores[0];a=answer(g);assert.equal(g.lives[0],before+1);assert.equal(a.flagLifeDelta,1);assert.equal(a.scoreLifeDelta,0);
assert.equal(a.points,780);assert.equal(g.scores[0],scoreBefore+780);assert.equal(a.basePoints,100);assert.equal(a.bonusPoints,680);
Core.advance(g,all);assert.equal(current(g).type,'country');assert.equal(g.lives[0],before);assert.equal(g.countriesPlayed[0],4);
// Exact 10,000 boundary: +2 attempts, one bonus, no duplication on restore.
for(const timeout of [false,true]){
 g=create();for(let i=0;i<10;i++)step(g,true,0);assert.equal(current(g).type,'flag');assert.equal(g.lives[0],5);assert.equal(current(g).bonusThreshold,10000);
 assert.equal(g.scores[0],10000);assert.equal(g.scoreLives[0],2);assert.equal(g.bonusMilestones[0],1);
 const restore=JSON.parse(JSON.stringify(g));assert.ok(Core.validateProgress(restore));
 for(const run of [g,restore]){timeout?Core.submit(run,null,20000):answer(run,false);Core.advance(run,all);}
 assert.deepEqual(g,restore);assert.equal(g.lives[0],4);assert.deepEqual(g.bonusIssued,[1]);assert.equal(Core.nextBonusThreshold(g,0),20000);
}
// Rescue at zero reserve: finish the paid country even before earning +2.
g=create();for(let i=0;i<20;i++)step(g,i<9,0);
assert.equal(g.scores[0],9000);assert.equal(g.lives[0],0);assert.equal(current(g).type,'country');a=answer(g,true,0);
assert.equal(a.scoreLifeDelta,2);assert.equal(g.lives[0],2);assert.equal(Core.nextTurn(g).kind,'question');
for(let i=0;i<4;i++){Core.advance(g,all);answer(g,false);}Core.advance(g,all);assert.equal(current(g).type,'flag');assert.equal(g.gameOver,false);
// Bulk awards use two lives per threshold and only ONE queued flag per threshold.
const bulk=Core.createEconomy(1);assert.deepEqual(Core.awardPoints(bulk,0,35000),[10000,20000,30000]);
assert.equal(bulk.lives[0],11);assert.equal(bulk.scoreLives[0],6);assert.deepEqual(bulk.pendingBonuses,[[10000,20000,30000]]);
assert.deepEqual(Core.awardPoints(bulk,0,0),[]);assert.equal(bulk.lives[0],11);
// A bonus's points are not exempt from thresholds: aggregate ledger edge case.
const ledger=Core.createEconomy(1);Core.awardPoints(ledger,0,19000);Core.consumeBonus(ledger,0);
const lifeBefore=ledger.lives[0];assert.deepEqual(Core.awardPoints(ledger,0,1000),[20000]);Core.awardFlagAttempt(ledger,0);
assert.equal(ledger.lives[0]-lifeBefore,3);assert.equal(ledger.lives[0],10);assert.deepEqual(ledger.pendingBonuses,[[20000]]);
assert.equal(ledger.scoreLives[0],4);assert.equal(ledger.flagLives[0],1);assert.equal(ledger.earnedLives[0],5);
assert.throws(()=>Core.awardPoints(ledger,0,-1));assert.throws(()=>Core.awardPoints(ledger,0,1.5));
// Duel: personal thresholds, scores, country entries and bonuses.
g=create({players:2});for(let i=0;i<15;i++)step(g,i<5||i>=10,0);
assert.equal(current(g).type,'flag');assert.equal(current(g).player,0);assert.deepEqual(g.scores,[10000,0]);
assert.deepEqual(g.lives,[5,4]);assert.deepEqual(g.scoreLives,[2,0]);step(g,false);assert.equal(current(g).player,1);assert.deepEqual(g.lives,[5,3]);
g=create({players:2});while(!g.completed){answer(g,false);Core.advance(g,all);}assert.equal(g.questions.length,50);assert.deepEqual(g.countriesPlayed,[5,5]);assert.deepEqual(g.lives,[0,0]);
// Exercise the complete quiz engine separately from the economic simulator.
function actualEngine({cap=2000,elapsed=5000,seed=71007,pattern=false}){
 const game=create({region:'Oceania',difficulty:'normal'},seed),random=Core.rng(seed);let countries=0,bonuses=0,regulars=0;
 const seen=[];
 while(!game.completed){
  const q=current(game);if(q.type==='country'){countries++;seen.push(q.country);}
  const n=q.type==='flag'?bonuses++:regulars++;
  answer(game,pattern?n%5!==4:random()<.8,elapsed);
  const next=Core.nextTurn(game);if(countries>=cap&&next.kind==='country')break;
  Core.advance(game,all);
 }
 assert.ok(Core.validateProgress(game));assert.ok(seen.every((code,i)=>!i||code!==seen[i-1]));
 assert.equal(game.lives[0],5-countries+2*Math.floor(game.scores[0]/10000)+game.flagLives[0]);
 return {game,report:{countries,bonuses,answers:game.answers.length,score:game.scores[0],reserveAttempts:game.lives[0],seed,pattern,answerMs:elapsed,completed:game.completed}};
}
const slow=actualEngine({elapsed:5000,cap:10000});assert.equal(slow.game.gameOver,true);assert.equal(slow.game.lives[0],0);
const fast=actualEngine({elapsed:3000,pattern:true,cap:2000});assert.equal(fast.report.countries,2000);assert.ok(fast.game.lives[0]>5);assert.ok(fast.game.cycles>10);
const tampered=JSON.parse(JSON.stringify(fast.game));tampered.lives[0]++;assert.equal(Core.validateProgress(tampered),false);
const oldVersion=JSON.parse(JSON.stringify(fast.game));oldVersion.version=6;assert.equal(Core.validateProgress(oldVersion),false);
const report={version:7,questionVariants:checked,configurations,actualEngine:[slow.report,fast.report]};
require('node:fs').writeFileSync(require('node:path').join(__dirname,'core-results.json'),JSON.stringify(report,null,2));
console.log('PASS — '+JSON.stringify(report));
