/* Reproducible Monte Carlo model using the same economic functions as the game.
   Batching the ordinary answers of a prepaid country is equivalent at its end:
   no further attempt can be debited there, and flags never interrupt a country. */
'use strict';
const Core=require('../src/core'),fs=require('node:fs'),path=require('node:path');
const DEFAULTS={trials:10000,capCountries:10000,regularP:.8,flagP:.8,elapsedMs:5000,timeRangeMs:null,seed:7100007};
function quantile(sorted,p){if(!sorted.length)return null;const x=(sorted.length-1)*p,lo=Math.floor(x),hi=Math.ceil(x);return sorted[lo]+(sorted[hi]-sorted[lo])*(x-lo);}
function mean(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;}
function averagePoints({elapsedMs,timeRangeMs}){
 if(!timeRangeMs)return Core.pointsForTime(elapsedMs,Core.TIME_LIMITS.normal);
 // Exact integration of score-rounding intervals against uniform response times.
 const [lo,hi]=timeRangeMs,limit=Core.TIME_LIMITS.normal,scale=(Core.MAX_POINTS-Core.BASE_POINTS)/10,cuts=[lo,hi];
 for(let k=0;k<scale;k++){const t=limit*(1-(k+.5)/scale);if(t>lo&&t<hi)cuts.push(t);}
 cuts.sort((a,b)=>a-b);let total=0;
 for(let i=1;i<cuts.length;i++)total+=(cuts[i]-cuts[i-1])*Core.pointsForTime((cuts[i]+cuts[i-1])/2,limit);
 return total/(hi-lo);
}
function expectation(settings){
 const c={...DEFAULTS,...settings},P=averagePoints(c),ordinary=5*c.regularP*P;
 const flags=ordinary/(Core.BONUS_INTERVAL-c.flagP*P),income=flags*(Core.MILESTONE_LIVES+c.flagP);
 return {meanPointsPerCorrect:P,ordinaryPointsPerCountry:ordinary,flagPointsPerBonus:c.flagP*P,
  bonusQuestionsPerCountry:flags,attemptIncomePerCountry:income,netReservePerCountry:income-1,
  breakEvenFlagAccuracy:(Core.BONUS_INTERVAL-Core.MILESTONE_LIVES*ordinary)/(ordinary+P)};
}
function simulate(settings={}){
 const c={...DEFAULTS,...settings};
 for(const key of ['trials','capCountries'])if(!Number.isSafeInteger(c[key])||c[key]<1)throw new RangeError(key);
 for(const key of ['regularP','flagP'])if(!(c[key]>=0&&c[key]<=1))throw new RangeError(key);
 if(c.timeRangeMs&&!(c.timeRangeMs.length===2&&c.timeRangeMs[0]>=0&&c.timeRangeMs[0]<c.timeRangeMs[1]&&c.timeRangeMs[1]<Core.TIME_LIMITS.normal))throw new RangeError('timeRangeMs');
 const fixedPoints=Core.pointsForTime(c.elapsedMs,Core.TIME_LIMITS.normal),survivorLives=[],deathCountries=[],cappedCountries=[],deathSamples=[];
 const checkpoints=Object.fromEntries([5,10,25,50,100,250,500,1000,10000].filter(n=>n<=c.capCountries).map(n=>[n,0]));
 let survived=0,regularAnswers=0,regularCorrect=0,flagAnswers=0,flagCorrect=0,totalCountries=0;
 let regularPoints=0,flagPoints=0,totalScore=0,totalReserve=0,scoreAttemptAwards=0,meanSurvivorScore=0;
 for(let run=0;run<c.trials;run++){
  const random=Core.rng((c.seed+Math.imul(run,0x9e3779b9))>>>0),g=Core.createEconomy(1);
  const responsePoints=c.timeRangeMs?()=>Core.pointsForTime(c.timeRangeMs[0]+random()*(c.timeRangeMs[1]-c.timeRangeMs[0]),Core.TIME_LIMITS.normal):()=>fixedPoints;
  let completed=0;
  while(completed<c.capCountries&&Core.spendCountryAttempt(g,0)){
   let countryPoints=0;for(let q=0;q<5;q++)if(random()<c.regularP){regularCorrect++;countryPoints+=responsePoints();}
   regularAnswers+=5;regularPoints+=countryPoints;Core.awardPoints(g,0,countryPoints);
   while(g.pendingBonuses[0].length){Core.consumeBonus(g,0);flagAnswers++;
    if(random()<c.flagP){flagCorrect++;const pts=responsePoints();flagPoints+=pts;Core.awardPoints(g,0,pts);Core.awardFlagAttempt(g,0);}
   }
   completed++;if(checkpoints[completed]!==undefined&&g.lives[0]>0)checkpoints[completed]++;
  }
  if(g.lives[0]!==Core.INITIAL_LIVES-completed+Core.MILESTONE_LIVES*Math.floor(g.scores[0]/Core.BONUS_INTERVAL)+g.flagLives[0])throw new Error('Attempt ledger mismatch');
  if(g.bonusIssued[0]!==g.bonusMilestones[0]||g.pendingBonuses[0].length)throw new Error('Undrained bonus queue');
  totalCountries+=completed;totalScore+=g.scores[0];totalReserve+=g.lives[0];scoreAttemptAwards+=g.scoreLives[0];cappedCountries.push(completed);
  if(completed===c.capCountries&&g.lives[0]>0){survived++;survivorLives.push(g.lives[0]);meanSurvivorScore+=g.scores[0];}
  else{deathCountries.push(completed);if(deathSamples.length<20)deathSamples.push({run,countries:completed,score:g.scores[0]});}
 }
 for(const arr of [survivorLives,deathCountries,cappedCountries])arr.sort((a,b)=>a-b);
 const p=survived/c.trials,z=1.959963984540054,den=1+z*z/c.trials,center=(p+z*z/(2*c.trials))/den;
 const half=z*Math.sqrt(p*(1-p)/c.trials+z*z/(4*c.trials*c.trials))/den;
 return {...c,pointsPerCorrect:c.timeRangeMs?null:fixedPoints,expectation:expectation(c),survived,deaths:c.trials-survived,survivalPercent:100*p,
  survivalWilson95Percent:[Math.max(0,(center-half)*100),Math.min(100,(center+half)*100)],checkpoints,totalCountries,regularAnswers,regularCorrect,
  observedRegularAccuracy:regularCorrect/regularAnswers,flagAnswers,flagCorrect,observedFlagAccuracy:flagAnswers?flagCorrect/flagAnswers:null,
  regularPoints,flagPoints,totalScore,totalReserve,scoreAttemptAwards,observedMeanPointsPerCorrect:(regularPoints+flagPoints)/(regularCorrect+flagCorrect),
  meanReserveAmongSurvivors:mean(survivorLives),medianReserveAmongSurvivors:quantile(survivorLives,.5),minReserveAmongSurvivors:survivorLives[0]??null,
  maxReserveAmongSurvivors:survivorLives.at(-1)??null,meanScoreAmongSurvivors:survived?meanSurvivorScore/survived:null,
  meanCountriesCappedAtHorizon:mean(cappedCountries),medianCountriesCappedAtHorizon:quantile(cappedCountries,.5),
  deathsCountriesQuantiles:{min:deathCountries[0]??null,p10:quantile(deathCountries,.1),p25:quantile(deathCountries,.25),median:quantile(deathCountries,.5),p75:quantile(deathCountries,.75),p90:quantile(deathCountries,.9),p95:quantile(deathCountries,.95),p99:quantile(deathCountries,.99),max:deathCountries.at(-1)??null},
  meanCountriesAmongDeaths:mean(deathCountries),deathSamples};
}
function fixedPattern(capCountries=10000,elapsedMs=5000){
 const g=Core.createEconomy(1),points=Core.pointsForTime(elapsedMs,Core.TIME_LIMITS.normal);let completed=0,flags=0,minReserve=5;
 while(completed<capCountries&&Core.spendCountryAttempt(g,0)){
  minReserve=Math.min(minReserve,g.lives[0]);Core.awardPoints(g,0,4*points);
  while(g.pendingBonuses[0].length){Core.consumeBonus(g,0);if(flags++%5!==4){Core.awardPoints(g,0,points);Core.awardFlagAttempt(g,0);}}
  completed++;
 }
 return {countries:completed,elapsedMs,pointsPerCorrect:points,regularPattern:'4 correct then 1 wrong in each country',flagPattern:'4 correct then 1 wrong, repeated',score:g.scores[0],reserve:g.lives[0],minimumReserve:minReserve,flagQuestions:flags,survivedHorizon:completed===capCountries&&g.lives[0]>0};
}
function main(){
 const start=Date.now(),mainResult=simulate();console.log('MAIN',JSON.stringify(mainResult));
 const settings=[
  {label:'80 % / exactly 4 s',elapsedMs:4000,seed:7104000},
  {label:'80 % / exactly 3 s',elapsedMs:3000,seed:7103000},
  {label:'80 % / exactly 2 s',elapsedMs:2000,seed:7102000},
  {label:'80 % / uniform 1–5 s',timeRangeMs:[1000,5000],seed:7101500},
  {label:'85 % / exactly 5 s',regularP:.85,flagP:.85,seed:7185500},
  {label:'80 % ordinary, 90 % flags / exactly 5 s',flagP:.9,seed:7180905},
 ];
 const controls=settings.map(s=>{const r=simulate(s);console.log('CONTROL',s.label,JSON.stringify({survived:r.survived,median:r.medianCountriesCappedAtHorizon,net:r.expectation.netReservePerCountry}));return r;});
 const report={version:7,method:'Seeded independent Bernoulli outcomes. Standard 20-second limit, five initial attempts, one per country; two per 10000 points; one per correct flag plus its score. No artificial rescues.',main:mainResult,controls,fixedPatterns:[fixedPattern(),fixedPattern(10000,3000)],runtimeMs:Date.now()-start};
 fs.writeFileSync(path.join(__dirname,'simulation-results.json'),JSON.stringify(report,null,2));console.log('SAVED',report.runtimeMs+' ms',JSON.stringify(report.fixedPatterns));
}
module.exports={simulate,fixedPattern,expectation,averagePoints};if(require.main===module)main();
