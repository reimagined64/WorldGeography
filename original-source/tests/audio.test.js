/* Composition/transition checks. Web Audio signal is tested in the browser. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sandbox={window:{},setInterval:()=>1,clearInterval(){}};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require.resolve('../src/audio.js'),'utf8'),sandbox);
const Audio=sandbox.window.GeoAudio,a=new Audio(),notes=[];
a.note=(midi,time,duration,type,level,group='music',slide=null,envelope=null)=>notes.push({midi,time,duration,type,level,group,slide,envelope});
a.scene='question';assert.equal(a.stepDuration(),60/108/2);assert.equal(Audio.QUESTION_SCORE.bpm,108);
assert.equal(Audio.QUESTION_SCORE.key,'C Dorian');assert.equal(Audio.QUESTION_SCORE.lead.length,64);
for(let step=0;step<64;step++)a.playStep(step,step*a.stepDuration());
assert.ok(notes.length>160&&notes.length<320,'articulated eight-bar groove');
assert.ok(notes.every(n=>n.duration<.35&&n.duration>0),'no long drone/pad notes');
assert.ok(notes.every(n=>[0,2,3,5,7,9,10].includes(n.midi%12)),'coherent C-Dorian pitch collection');
const bass=notes.filter(n=>n.type==='triangle'&&n.level>=.13);
assert.equal(bass.length,40);assert.ok(bass.every(n=>n.midi>=43&&n.midi<=65),'bass audible above the old sub-bass range');
assert.ok(notes.some(n=>n.midi%12===9),'natural sixth supplies the Dorian color');
assert.ok(notes.some(n=>n.midi%12===3),'minor third retains mystery');
const first=JSON.stringify(notes);notes.length=0;
a.transpose=7;for(let s=0;s<64;s++)a.playStep(s,s*a.stepDuration());
assert.equal(JSON.stringify(notes),first,'same tonal home for every country and all answer cues');
a.scene='urgent';assert.equal(a.stepDuration(),.25);notes.length=0;
for(let s=0;s<64;s++)a.playStep(s,s*.25);
assert.equal(notes.filter(n=>n.duration===.07&&n.midi===79).length,32,'extra urgency pulse');
assert.ok(notes.every(n=>n.duration<.35));
for(const kind of ['correct','wrong','timeout']){
  notes.length=0;a.scheduleCue(kind,1);
  const lead=notes.filter(n=>n.type==='square');
  assert.ok(notes.every(n=>n.group==='effects'&&n.level<=.13));
  assert.ok(notes.every(n=>[0,2,5,7].includes(n.midi%12)),'answer cues share open C/D/G harmony');
  assert.ok(Math.max(...notes.map(n=>n.time+n.duration))-1<.7,'brief answer response');
  for(let i=1;i<lead.length;i++)assert.ok(kind==='correct'?lead[i].midi>lead[i-1].midi:lead[i].midi<lead[i-1].midi);
}
for(const scene of ['home','flight','bonus']){a.scene=scene;notes.length=0;for(let s=0;s<32;s++)a.playStep(s,s*a.stepDuration());assert.ok(notes.length>0);}
const transition=new Audio();transition.context={currentTime:17};transition.scene='question';transition.step=19;transition.nextTime=17.1;
transition.applyTimbre=()=>{};transition.runScheduler=()=>{};let cuts=0;transition.stopVoices=()=>cuts++;
transition.setScene('urgent');assert.equal(transition.step,19);assert.equal(transition.nextTime,17.1);assert.equal(cuts,0,'tempo change does not cut phrase');
transition.setScene('feedback');assert.equal(cuts,1);assert.equal(transition.step,0,'feedback clears music');
const resumed=new Audio();resumed.context={currentTime:17};resumed.paused=true;resumed.step=3;resumed.nextTime=19;
resumed.applyVolume=()=>{};let starts=0;resumed.runScheduler=()=>starts++;resumed.setPaused(false);
assert.equal(resumed.step,3);assert.equal(resumed.nextTime,17.035);assert.equal(starts,1);
console.log('PASS — 108-BPM C-Dorian quiz groove, short envelopes, 120-BPM continuous urgency, related rising/falling cues, retained menu/flight/bonus, pause/resume.');

assert.equal(Audio.QUESTION_SCORES.length,21);
assert.equal(new Set(Audio.QUESTION_SCORES.map(s=>JSON.stringify(s.lead))).size,21);
for(let id=0;id<21;id++){
 a.scoreIndex=id;a.scene='question';notes.length=0;const score=Audio.QUESTION_SCORES[id];
 assert.equal(score.lead.length,id===0?64:128);
 for(let j=0;j<score.lead.length;j++)a.playStep(j,j*a.stepDuration());
 assert.ok(notes.every(n=>[0,2,3,5,7,9,10].includes(n.midi%12)));assert.ok(notes.every(n=>n.duration<.35));
 assert.ok(notes.every(n=>Number.isFinite(n.midi)&&n.duration>0));
}
const shuffled=new Audio({random:require('../src/core').rng(6006)});let previous=-1,lastId=-1;
for(let cycle=0;cycle<100;cycle++){const seen=new Set();for(let i=0;i<21;i++){
 const key=`${cycle}:${i}`;assert.equal(shuffled.beginQuestion(key),true);
 assert.notEqual(shuffled.questionStartStep,previous);assert.notEqual(shuffled.scoreIndex,lastId);
 previous=shuffled.questionStartStep;lastId=shuffled.scoreIndex;seen.add(shuffled.scoreIndex);
 const position=shuffled.step;assert.equal(shuffled.beginQuestion(key),false);assert.equal(shuffled.step,position);
}assert.equal(seen.size,21);}
console.log('PASS — 21 unique melodies, 20 new 16-bar scores, 2,100 shuffled selections, distinct starting positions, no immediate theme repeat, pause preserves phrase.');
