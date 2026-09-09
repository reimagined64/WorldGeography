/* Original synthesized chip music; no samples, ROMs, or copied C64 melodies.
   Menu/flight chip music; a pulsed C-Dorian quiz score and tonally related answer cues.
   Web Audio is created/resumed only in response to a user's gesture. */
(function(root){
'use strict';
const MELODY=[72,0,76,79,0,76,74,0,72,0,67,0,69,72,0,0,74,0,77,81,0,79,76,0,74,72,71,0,67,0,72,0];
const BASS=[48,48,53,55],CHORDS=[[0,4,7,12],[0,4,7,16],[0,5,9,12],[0,4,7,10]];
// Original eight-bar quiz loop: C Dorian, open suspended harmonies and a dry pulse.
// Eighth-note grid at 108 BPM. Short notes leave space for reading and feedback.
const QUESTION_SCORE=Object.freeze({bpm:108,urgentBpm:120,key:'C Dorian',
  stepSeconds:60/108/2,urgentStepSeconds:60/120/2,
  roots:[48,48,46,43,48,53,46,43],
  chords:[[60,63,67,74],[60,65,67,69],[58,62,65,72],[55,60,62,65],
          [60,63,67,74],[57,60,65,72],[58,62,65,72],[55,60,62,65]],
  bassPattern:[0,null,0,7,null,0,12,null],
  lead:[0,74,0,72,0,0,67,69, 0,72,0,74,0,0,75,74,
        0,70,0,74,0,0,72,0, 67,0,0,65,0,0,62,0,
        0,74,0,75,0,0,74,72, 0,69,0,72,0,0,74,0,
        70,0,74,0,0,72,0,69, 67,0,0,65,0,62,0,0]});
// Twenty additional authored themes. Their motifs, chord orders, rhythmic
// entrances and bass accents differ; they are not transpositions of one loop.
// A theme unfolds over sixteen bars (35.6 s at 108 BPM), twice the original.
const THEME_MATERIAL = [
  ['Meridián',       [0,3,1,2,0,4,3,2], [74,67,72,69, 75,74,67,72, 70,65,69,74, 67,62,65,72]],
  ['Skrytý signál',  [0,4,2,1,3,0,4,2], [67,74,75,72, 69,65,72,74, 70,74,67,65, 62,67,72,69]],
  ['Před startem',   [2,0,3,4,1,0,3,2], [72,74,67,75, 74,69,65,72, 67,70,74,72, 65,62,67,74]],
  ['Souřadnice',     [0,1,4,3,2,0,1,2], [75,72,74,67, 65,69,74,72, 70,67,65,74, 72,67,62,65]],
  ['Tichý kompas',   [3,0,2,1,4,3,0,2], [69,72,67,74, 75,67,74,72, 65,70,74,69, 67,72,65,62]],
  ['Druhá stopa',    [4,0,3,2,1,4,0,2], [74,75,72,67, 72,65,69,74, 67,74,70,65, 62,65,72,67]],
  ['Poledník',       [0,2,4,1,3,0,4,2], [67,72,69,75, 74,72,65,69, 70,74,65,67, 72,62,67,74]],
  ['Napětí v éteru', [2,4,0,3,1,0,3,2], [72,67,74,69, 75,72,67,74, 65,74,70,69, 67,65,62,72]],
  ['Modrý radar',    [0,3,4,2,1,3,0,2], [74,72,75,69, 67,74,72,65, 70,67,74,69, 62,72,67,65]],
  ['Blízko cíle',    [3,1,0,4,2,0,3,2], [69,74,72,67, 75,69,74,72, 65,70,67,74, 72,67,65,62]],
  ['Noční navigace',[0,4,1,3,0,2,4,2], [67,75,74,72, 69,72,65,74, 70,65,74,67, 62,67,65,72]],
  ['Soutěžní pulz',  [2,3,0,1,4,0,3,2], [72,69,74,75, 67,72,74,65, 70,74,69,67, 65,72,62,67]],
  ['Za obzorem',     [4,3,0,2,1,0,4,2], [75,74,69,72, 67,65,74,72, 70,69,65,74, 62,72,65,67]],
  ['Rozhodnutí',     [0,2,3,4,1,0,4,2], [74,67,69,72, 75,72,74,65, 70,74,67,69, 62,65,67,72]],
  ['Stříbrná osa',   [3,4,1,0,2,3,0,2], [69,67,72,74, 75,65,72,74, 70,67,69,65, 72,62,74,67]],
  ['Kontrolní bod',  [0,1,3,2,4,0,3,2], [67,74,72,75, 69,74,65,72, 70,65,67,74, 62,72,69,67]],
  ['Vzdálená stanice',[4,2,0,3,1,0,4,2],[72,75,67,74, 69,65,74,72, 70,69,74,65, 67,62,72,74]],
  ['Poslední stopa', [2,0,4,3,1,4,0,2], [74,69,72,75, 67,72,65,74, 70,74,65,69, 62,67,74,72]],
  ['Šifra na mapě',  [0,4,3,1,2,3,0,2], [75,67,72,74, 69,74,72,65, 70,67,74,65, 72,62,69,67]],
  ['Přesná odpověď', [3,0,1,4,2,0,4,2], [72,74,69,67, 75,74,65,72, 70,69,67,74, 62,72,67,65]]
];
const HARMONIES=[
  {root:48,notes:[60,63,67,74]}, {root:46,notes:[58,62,65,72]},
  {root:43,notes:[55,60,62,65]}, {root:53,notes:[57,60,65,72]},
  {root:50,notes:[62,65,69,72]}];
const BASS_PATTERNS=[[0,null,0,7,null,0,12,null],[0,null,7,null,0,null,12,7],
  [0,null,null,7,0,null,7,null],[0,null,12,null,0,7,null,0]];
const ENTRANCES=[[1,3,5,6],[0,3,5,7],[1,2,4,6],[0,2,5,7],[1,3,4,7]];
const DORIAN=[60,62,63,65,67,69,70,72,74,75,77,79,81,82,84,86];
function composeTheme(material,theme){
  const [name,progression,motif]=material,roots=[],chords=[],lead=Array(128).fill(0);
  for(let bar=0;bar<16;bar++){
    const harmonic=HARMONIES[progression[(bar+(bar>=8?theme%3:0))%8]];
    roots.push(harmonic.root);chords.push([...harmonic.notes]);
    const phrase=Math.floor(bar/2)%4,notes=motif.slice(phrase*4,phrase*4+4);
    // Each two-bar call gets a displaced, harmonically resolved answer.
    if(bar%2){notes.reverse();notes[3]=harmonic.notes[(theme+phrase)%4]+12;}
    const positions=ENTRANCES[(theme+bar)%ENTRANCES.length];
    for(let n=0;n<4;n++){
      let pitch=notes[n];
      // A contrasting second half develops the motif diatonically, not as a
      // literal repeat. Lower lead density leaves space for reading the quiz.
      if(bar>=8&&n===1)pitch=DORIAN[Math.max(0,Math.min(DORIAN.length-1,DORIAN.indexOf(pitch)+(theme%2?1:-1)))];
      if((bar+theme)%3===0&&n===2)continue;
      lead[bar*8+positions[n]]=Math.min(81,pitch);
    }
  }
  return Object.freeze({name,bpm:108,urgentBpm:120,key:'C Dorian',stepSeconds:60/108/2,urgentStepSeconds:60/120/2,
    roots:Object.freeze(roots),chords:Object.freeze(chords),lead:Object.freeze(lead),
    bassPattern:Object.freeze([...BASS_PATTERNS[theme%4]]),arpOrder:Object.freeze(theme%2?[0,2,1,3]:[2,0,3,1])});
}
const QUESTION_SCORES=Object.freeze([Object.freeze({...QUESTION_SCORE,name:'Původní soutěžní motiv'}),...THEME_MATERIAL.map(composeTheme)]);
class GeoAudio {
  constructor(settings={}){
    this.enabled=settings.enabled!==false;this.music=settings.music!==false;this.effects=settings.effects!==false;
    this.volume=Number.isFinite(settings.volume)?Math.max(0,Math.min(1,settings.volume)):.42;
    this.context=null;this.scene='home';this.paused=false;this.unlocked=false;this.failed=false;
    this.random=typeof settings.random==='function'?settings.random:Math.random;
    this.scoreIndex=0;this.scoreBag=[];this.startBags=QUESTION_SCORES.map(()=>[]);this.previousStart=-1;this.questionStartStep=0;this.questionSerial=0;this.lastQuestionKey=null;this.themePrepared=false;
    this.voices=new Set();this.step=0;this.nextTime=0;this.scheduler=null;this.transpose=0;this.noteCount=0;
  }
  settings(){return {enabled:this.enabled,music:this.music,effects:this.effects,volume:this.volume};}
  unlock(){
    if(!this.enabled)return Promise.resolve(false);
    try{
      if(!this.context){
        const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)throw new Error('Web Audio není dostupné.');
        this.connectGraph(new Audio());
      }
      return Promise.resolve(this.context.resume()).then(()=>{
        this.unlocked=true;this.failed=false;this.applyTimbre();this.applyVolume();this.runScheduler();this.onChange?.();return true;
      }).catch(()=>{this.failed=true;this.onChange?.();return false;});
    }catch{this.failed=true;this.onChange?.();return Promise.resolve(false);}
  }
  // Shared by live playback and the reproducible OfflineAudioContext demo.
  connectGraph(ctx){
    this.context=ctx;
    this.master=ctx.createGain();this.master.gain.value=0;
    this.musicBus=ctx.createGain();this.musicBus.gain.value=.6;
    this.effectBus=ctx.createGain();this.effectBus.gain.value=.7;
    this.musicFilter=ctx.createBiquadFilter();this.musicFilter.type='lowpass';this.musicFilter.frequency.value=3600;this.musicFilter.Q.value=.5;
    this.effectFilter=ctx.createBiquadFilter();this.effectFilter.type='lowpass';this.effectFilter.frequency.value=3200;this.effectFilter.Q.value=.45;
    this.compressor=ctx.createDynamicsCompressor();this.compressor.threshold.value=-16;this.compressor.knee.value=12;this.compressor.ratio.value=4;
    this.analyser=ctx.createAnalyser();this.analyser.fftSize=256;
    this.musicBus.connect(this.musicFilter);this.musicFilter.connect(this.master);
    this.effectBus.connect(this.effectFilter);this.effectFilter.connect(this.master);
    this.master.connect(this.compressor);this.compressor.connect(this.analyser);this.analyser.connect(ctx.destination);
  }
  applyVolume(){if(!this.context)return;const t=this.context.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setTargetAtTime(this.enabled&&!this.paused?this.volume*.72:0,t,.018);}
  configure(values){
    const wasAudible=this.enabled&&this.music;
    for(const key of ['enabled','music','effects'])if(typeof values[key]==='boolean')this[key]=values[key];
    if(Number.isFinite(values.volume))this.volume=Math.max(0,Math.min(1,values.volume));
    if(!wasAudible&&this.enabled&&this.music){this.nextTime=this.context?this.context.currentTime+.035:0;}
    this.applyVolume();
    if(!this.enabled||!this.music)this.stopVoices('music');
    if(!this.enabled||!this.effects)this.stopVoices('effects');
    this.runScheduler();this.onChange?.();
  }
  setPaused(value){if(this.paused===value)return;this.paused=value;if(value){this.stopVoices();this.stopScheduler();}else{this.nextTime=this.context?this.context.currentTime+.035:0;this.runScheduler();}this.applyVolume();this.onChange?.();}
  setRegion(region){this.transpose=({Europe:0,Asia:2,Africa:5,Americas:0,Oceania:7})[region]||0;}
  applyTimbre(){
    if(!this.musicFilter||!this.context)return;
    const f=this.scene==='question'?2700:this.scene==='urgent'?3100:3600;
    this.musicFilter.frequency.setTargetAtTime(f,this.context.currentTime,.12);
  }
  activeScore(){return QUESTION_SCORES[this.scoreIndex];}
  shuffled(values){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  prepareTheme(){
    if(!this.scoreBag.length){
      this.scoreBag=this.shuffled(QUESTION_SCORES.map((_,i)=>i));
      if(this.questionSerial&&this.scoreBag[0]===this.scoreIndex)[this.scoreBag[0],this.scoreBag[1]]=[this.scoreBag[1],this.scoreBag[0]];
    }
    this.scoreIndex=this.scoreBag.shift();const score=this.activeScore();
    let bag=this.startBags[this.scoreIndex];
    if(!bag.length)bag=this.startBags[this.scoreIndex]=this.shuffled(Array.from({length:score.lead.length/2},(_,i)=>i*2));
    // A shuffled bag also covers all starting positions of each theme. Avoid
    // the preceding question's offset even when the selected theme differs.
    let pos=bag.findIndex(n=>n!==this.previousStart);
    if(pos<0){bag=this.startBags[this.scoreIndex]=this.shuffled(Array.from({length:score.lead.length/2},(_,i)=>i*2));pos=bag.findIndex(n=>n!==this.previousStart);}
    this.questionStartStep=bag.splice(pos,1)[0];
    this.previousStart=this.questionStartStep;this.step=this.questionStartStep;this.questionSerial++;
    this.stopVoices('music');this.nextTime=this.context?this.context.currentTime+.06:0;
  }
  beginQuestion(key){
    if(key===this.lastQuestionKey)return false;
    this.lastQuestionKey=key;this.prepareTheme();this.themePrepared=true;return true;
  }
  stepDuration(){const score=this.activeScore();return this.scene==='flight'?.105:this.scene==='urgent'?score.urgentStepSeconds:this.scene==='question'?score.stepSeconds:.185;}
  setScene(scene){
    if(this.scene===scene){if(this.scheduler===null)this.runScheduler();return;}
    // The last-five-seconds variant keeps the musical phrase, instead of
    // cutting back to bar one in the middle of a thought.
    const sameTheme=['question','urgent'].includes(this.scene)&&['question','urgent'].includes(scene);
    this.scene=scene;this.applyTimbre();
    if(!sameTheme){
      if(['question','urgent'].includes(scene)){if(!this.themePrepared)this.prepareTheme();this.themePrepared=false;}else this.step=0;
      this.stopVoices('music');this.nextTime=this.context?this.context.currentTime+.06:0;
    }
    this.runScheduler();this.onChange?.();
  }
  stopScheduler(){if(this.scheduler!==null)clearInterval(this.scheduler);this.scheduler=null;}
  runScheduler(){
    this.stopScheduler();
    if(!this.context||!this.unlocked||!this.enabled||!this.music||this.paused||['feedback','paused'].includes(this.scene))return;
    this.nextTime=Math.max(this.nextTime,this.context.currentTime+.035);
    const schedule=()=>{
      if(this.context.state!=='running')return;
      if(this.nextTime<this.context.currentTime-.2)this.nextTime=this.context.currentTime+.035;
      while(this.nextTime<this.context.currentTime+.13){this.playStep(this.step++,this.nextTime);this.nextTime+=this.stepDuration();}
    };
    schedule();this.scheduler=setInterval(schedule,25);
  }
  note(midi,time,duration,type='square',level=.07,group='music',slide=null,envelope=null){
    const ctx=this.context;if(!ctx||!this.enabled||this.paused||!this.unlocked||!midi||!(group==='music'?this.music:this.effects))return;
    const osc=ctx.createOscillator(),gain=ctx.createGain(),f=440*Math.pow(2,(midi-69)/12);
    osc.type=type;osc.frequency.setValueAtTime(f,time);
    if(slide!==null)osc.frequency.exponentialRampToValueAtTime(440*Math.pow(2,(slide-69)/12),time+duration);
    gain.gain.setValueAtTime(.00001,time);
    if(envelope){
      const attack=Math.min(duration*.25,envelope.attack||.08),release=Math.min(duration*.4,envelope.release||.18);
      gain.gain.linearRampToValueAtTime(level,time+attack);
      gain.gain.setValueAtTime(level*.8,time+Math.max(attack,duration-release));
      gain.gain.exponentialRampToValueAtTime(.00001,time+duration);
    }else{
      gain.gain.linearRampToValueAtTime(level,time+.009);
      gain.gain.exponentialRampToValueAtTime(.00001,time+Math.max(.02,duration));
    }
    osc.connect(gain);gain.connect(group==='music'?this.musicBus:this.effectBus);
    const voice={osc,gain,group};this.voices.add(voice);this.noteCount++;
    osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices.delete(voice);};osc.start(time);osc.stop(time+duration+.03);
  }
  playStep(step,t){
    const s=step%32,bar=Math.floor(s/8),rootNote=BASS[bar]+this.transpose,chord=CHORDS[bar];
    if(this.scene==='bonus'){
      const notes=[72,76,79,84,81,79,76,74];
      if(s%2===0)this.note(notes[Math.floor(s/2)%8],t,.2,'square',.055);
      if(s%4===0)this.note(rootNote,t,.55,'triangle',.13);
    }else if(this.scene==='flight'){
      this.note(rootNote+24+chord[s%4],t,.085,'square',.07);
      if(s%4===0)this.note(rootNote,t,.32,'triangle',.19);
      if(s%8===4)this.note(rootNote+12,t,.13,'square',.035);
    }else if(this.scene==='question'||this.scene==='urgent'){
      const score=this.activeScore(),urgent=this.scene==='urgent',beat=this.stepDuration(),q=step%score.lead.length,b=Math.floor(q/8),i=q%8;
      const bass=score.roots[b],harmony=score.chords[b],offset=score.bassPattern[i];
      const pluck={attack:.006,release:.07};
      // Syncopated bass: articulated, above the old sub-bass register; no drone.
      if(offset!==null)this.note(bass+offset,t,beat*(i===0?.92:.66),'triangle',i===0?.19:.13,'music',null,pluck);
      // Four dry arpeggio notes per bar, using open 9ths/6ths rather than a lament.
      if(i%2===1){
        const n=harmony[score.arpOrder?score.arpOrder[(i-1)/2]:(i-1)/2];
        this.note(n,t,beat*.62,'triangle',.085,'music',null,pluck);
        this.note(n,t,beat*.5,'square',.013,'music',null,pluck);
      }
      if(score.lead[q])this.note(score.lead[q],t,beat*(i===6?1.22:.82),'square',.033,'music',null,{attack:.008,release:.09});
      // Tuned, synthesized percussion: a small kick and a soft clock-like click.
      // No noise samples, downloads or persistent low pad.
      if(i%4===0)this.note(48,t,.085,'sine',.09,'music',36);
      if(i%2===1)this.note(96,t,.027,'triangle',.014);
      if(i===2||i===6)this.note(84,t,.045,'triangle',.028);
      if(urgent&&i%2===0)this.note(79,t,.07,'triangle',.035);
    }else{
      if(MELODY[s])this.note(MELODY[s]+this.transpose,t,.24,'square',.065);
      if(s%4===0)this.note(rootNote,t,.56,'triangle',.17);
      if(s%2===1)this.note(rootNote+12+chord[s%4],t,.14,'triangle',.09);
    }
  }
  cue(kind){
    if(!this.context||!this.unlocked||!this.enabled||!this.effects||this.paused)return;
    if(!['flight','tick','select','zoom'].includes(kind))this.stopVoices('effects');
    this.scheduleCue(kind,this.context.currentTime+.015);
  }
  // Scheduling is separate so the downloadable demo uses the exact live cues.
  scheduleCue(kind,t){
    if(kind==='flight'){this.note(40,t,.75,'sawtooth',.048,'effects',64);return;}
    if(kind==='tick'){this.note(84,t,.055,'triangle',.07,'effects');return;}
    if(kind==='select'){this.note(72,t,.055,'triangle',.07,'effects');return;}
    if(kind==='zoom'){this.note(60,t,.48,'triangle',.12,'effects',84);return;}
    if(['correct','wrong','timeout'].includes(kind)){
      // C/D/G is shared with the quiz motif. Success rises; an error falls,
      // without a harsh buzzer, a foreign key or a long, mournful ending.
      const melody=kind==='correct'?[72,74,79,84]:kind==='wrong'?[67,65,62,60]:[67,62,60];
      const offsets=[0,.105,.21,.34];
      melody.forEach((n,i)=>{
        const duration=i===melody.length-1?.25:.105;
        this.note(n,t+offsets[i],duration,'square',.048,'effects',null,{attack:.006,release:.08});
        this.note(n,t+offsets[i],duration,'triangle',.058,'effects',null,{attack:.004,release:.07});
      });
      this.note(48,t,.26,'triangle',.13,'effects',null,{attack:.006,release:.09});
      this.note(55,t,.22,'triangle',.065,'effects',null,{attack:.006,release:.08});
      return;
    }
    const notes=({bonus:[72,79,84,79,88],extraLife:[72,74,79,84,86,91],arrival:[67,72,74,79],complete:[72,76,79,84,79,84,88]})[kind];
    if(!notes)return;
    notes.forEach((n,i)=>this.note(n,t+i*.115,kind==='complete'?.32:.18,'square',.075,'effects'));
    this.note(48,t,.5,'triangle',.14,'effects');
  }
  stopVoices(group){
    if(!this.context)return;const t=this.context.currentTime;
    for(const voice of [...this.voices]){if(group&&voice.group!==group)continue;try{voice.gain.gain.cancelScheduledValues(t);voice.gain.gain.setTargetAtTime(.00001,t,.006);voice.osc.stop(t+.025);}catch{/* Already stopped. */}}
  }
  status(){
    let rms=0;if(this.analyser){const a=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(a);rms=Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);}
    return {...this.settings(),scene:this.scene,paused:this.paused,unlocked:this.unlocked,failed:this.failed,state:this.context?.state||'not-started',notes:this.noteCount,rms,melody:{index:this.scoreIndex,name:this.activeScore().name,count:QUESTION_SCORES.length,startStep:this.questionStartStep,step:this.step,length:this.activeScore().lead.length,serial:this.questionSerial}};
  }
  destroy(){this.stopScheduler();this.stopVoices();if(this.context)this.context.close().catch(()=>{});}
}
GeoAudio.QUESTION_SCORE=QUESTION_SCORE;
GeoAudio.QUESTION_SCORES=QUESTION_SCORES;
root.GeoAudio=GeoAudio;
})(window);
