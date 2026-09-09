/* Original synthesized chip music; no samples, ROMs, or copied C64 melodies.
   Menu/flight chip music; a pulsed C-Dorian quiz score and tonally related answer cues.
   Web Audio is created/resumed only in response to a user's gesture. */
/**
 * A structural port of the v7 `audio.js` minus its score tables, which moved to
 * `themes.ts` whole. Same method names, same argument order, same scheduling
 * window, same envelopes: `audio-golden.json` is a spectral digest of what this
 * class renders, and it hears a changed envelope or a retuned filter.
 *
 * The graph nodes are declared as always-present because `connectGraph` builds
 * them in one run alongside `context`, which nothing ever sets back to null;
 * every method that touches a node tests `context` first, exactly as v7 did.
 */
import { QUESTION_SCORE, QUESTION_SCORES, type Score } from './themes.ts';

const MELODY=[72,0,76,79,0,76,74,0,72,0,67,0,69,72,0,0,74,0,77,81,0,79,76,0,74,72,71,0,67,0,72,0];
const BASS=[48,48,53,55],CHORDS=[[0,4,7,12],[0,4,7,16],[0,5,9,12],[0,4,7,10]];

/**
 * The two contexts the graph is built on: the live one a gesture creates, and
 * the `OfflineAudioContext` the golden capture and the audio spec render into.
 */
export type SynthContext = AudioContext | OfflineAudioContext;

/** One scheduled note, held only until its oscillator ends or is stopped. */
interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  group: string;
}

/** The plucked-articulation shape; absent means the default click-on attack. */
export interface Envelope {
  attack?: number;
  release?: number;
}

/** The persisted sound preferences: what `settings()` returns and `configure` takes. */
export interface AudioPreferences {
  enabled: boolean;
  music: boolean;
  effects: boolean;
  volume: number;
}

/** Constructor input: stored preferences, plus the injectable shuffle source. */
export interface AudioSettings extends Partial<AudioPreferences> {
  random?: () => number;
}

export class GeoAudio {
  enabled: boolean;
  music: boolean;
  effects: boolean;
  volume: number;
  context: SynthContext | null;
  scene: string;
  paused: boolean;
  unlocked: boolean;
  failed: boolean;
  random: () => number;
  scoreIndex: number;
  scoreBag: number[];
  startBags: number[][];
  previousStart: number;
  questionStartStep: number;
  questionSerial: number;
  lastQuestionKey: string | null;
  themePrepared: boolean;
  voices: Set<Voice>;
  step: number;
  nextTime: number;
  scheduler: ReturnType<typeof setInterval> | null;
  transpose: number;
  noteCount: number;
  // `connectGraph` builds the whole graph in one statement run, next to
  // `context`, and every reader gates on `context` before touching a node.
  master!: GainNode;
  musicBus!: GainNode;
  effectBus!: GainNode;
  musicFilter!: BiquadFilterNode;
  effectFilter!: BiquadFilterNode;
  compressor!: DynamicsCompressorNode;
  analyser!: AnalyserNode;
  /** Installed by `app.js`; re-renders the sound panel whenever state moves. */
  onChange?: () => void;
  constructor(settings: AudioSettings={}){
    this.enabled=settings.enabled!==false;this.music=settings.music!==false;this.effects=settings.effects!==false;
    this.volume=Number.isFinite(settings.volume)?Math.max(0,Math.min(1,settings.volume!)):.42;
    this.context=null;this.scene='home';this.paused=false;this.unlocked=false;this.failed=false;
    this.random=typeof settings.random==='function'?settings.random:Math.random;
    this.scoreIndex=0;this.scoreBag=[];this.startBags=QUESTION_SCORES.map((): number[]=>[]);this.previousStart=-1;this.questionStartStep=0;this.questionSerial=0;this.lastQuestionKey=null;this.themePrepared=false;
    this.voices=new Set();this.step=0;this.nextTime=0;this.scheduler=null;this.transpose=0;this.noteCount=0;
  }
  settings(): AudioPreferences {return {enabled:this.enabled,music:this.music,effects:this.effects,volume:this.volume};}
  unlock(): Promise<boolean> {
    if(!this.enabled)return Promise.resolve(false);
    try{
      if(!this.context){
        const Audio=window.AudioContext||(window as Window&{webkitAudioContext?: typeof AudioContext}).webkitAudioContext;if(!Audio)throw new Error('Web Audio není dostupné.');
        this.connectGraph(new Audio());
      }
      return Promise.resolve(this.context!.resume()).then(()=>{
        this.unlocked=true;this.failed=false;this.applyTimbre();this.applyVolume();this.runScheduler();this.onChange?.();return true;
      }).catch(()=>{this.failed=true;this.onChange?.();return false;});
    }catch{this.failed=true;this.onChange?.();return Promise.resolve(false);}
  }
  // Shared by live playback and the reproducible OfflineAudioContext demo.
  connectGraph(ctx: SynthContext): void {
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
  applyVolume(): void {if(!this.context)return;const t=this.context.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setTargetAtTime(this.enabled&&!this.paused?this.volume*.72:0,t,.018);}
  configure(values: Partial<AudioPreferences>): void {
    const wasAudible=this.enabled&&this.music;
    // Reading the element into a `const` is what lets the checker carry the
    // `typeof` narrowing into the assignment. Same keys, same order.
    for(const key of ['enabled','music','effects'] as const){const value=values[key];if(typeof value==='boolean')this[key]=value;}
    if(Number.isFinite(values.volume))this.volume=Math.max(0,Math.min(1,values.volume!));
    if(!wasAudible&&this.enabled&&this.music){this.nextTime=this.context?this.context.currentTime+.035:0;}
    this.applyVolume();
    if(!this.enabled||!this.music)this.stopVoices('music');
    if(!this.enabled||!this.effects)this.stopVoices('effects');
    this.runScheduler();this.onChange?.();
  }
  setPaused(value: boolean): void {if(this.paused===value)return;this.paused=value;if(value){this.stopVoices();this.stopScheduler();}else{this.nextTime=this.context?this.context.currentTime+.035:0;this.runScheduler();}this.applyVolume();this.onChange?.();}
  setRegion(region: string): void {this.transpose=(({Europe:0,Asia:2,Africa:5,Americas:0,Oceania:7}) as Record<string, number>)[region]||0;}
  applyTimbre(): void {
    if(!this.musicFilter||!this.context)return;
    const f=this.scene==='question'?2700:this.scene==='urgent'?3100:3600;
    this.musicFilter.frequency.setTargetAtTime(f,this.context.currentTime,.12);
  }
  // `scoreIndex` only ever comes from a bag of this array's own indices.
  activeScore(): Score {return QUESTION_SCORES[this.scoreIndex]!;}
  shuffled<T>(values: readonly T[]): T[] {const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];}return a;}
  prepareTheme(): void {
    if(!this.scoreBag.length){
      this.scoreBag=this.shuffled(QUESTION_SCORES.map((_,i)=>i));
      // The bag was just refilled with all 21 indices, so both slots exist.
      if(this.questionSerial&&this.scoreBag[0]===this.scoreIndex)[this.scoreBag[0],this.scoreBag[1]]=[this.scoreBag[1]!,this.scoreBag[0]!];
    }
    this.scoreIndex=this.scoreBag.shift()!;const score=this.activeScore();
    // One bag per score, built in the constructor, so this index is filled.
    let bag=this.startBags[this.scoreIndex]!;
    if(!bag.length)bag=this.startBags[this.scoreIndex]=this.shuffled(Array.from({length:score.lead.length/2},(_,i)=>i*2));
    // A shuffled bag also covers all starting positions of each theme. Avoid
    // the preceding question's offset even when the selected theme differs.
    let pos=bag.findIndex(n=>n!==this.previousStart);
    if(pos<0){bag=this.startBags[this.scoreIndex]=this.shuffled(Array.from({length:score.lead.length/2},(_,i)=>i*2));pos=bag.findIndex(n=>n!==this.previousStart);}
    this.questionStartStep=bag.splice(pos,1)[0]!;
    this.previousStart=this.questionStartStep;this.step=this.questionStartStep;this.questionSerial++;
    this.stopVoices('music');this.nextTime=this.context?this.context.currentTime+.06:0;
  }
  beginQuestion(key: string): boolean {
    if(key===this.lastQuestionKey)return false;
    this.lastQuestionKey=key;this.prepareTheme();this.themePrepared=true;return true;
  }
  stepDuration(): number {const score=this.activeScore();return this.scene==='flight'?.105:this.scene==='urgent'?score.urgentStepSeconds:this.scene==='question'?score.stepSeconds:.185;}
  setScene(scene: string): void {
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
  stopScheduler(): void {if(this.scheduler!==null)clearInterval(this.scheduler);this.scheduler=null;}
  runScheduler(): void {
    this.stopScheduler();
    if(!this.context||!this.unlocked||!this.enabled||!this.music||this.paused||['feedback','paused'].includes(this.scene))return;
    this.nextTime=Math.max(this.nextTime,this.context.currentTime+.035);
    // `context` is set once by `connectGraph` and never cleared, and the
    // guard above already returned if it was still missing.
    const schedule=()=>{
      if(this.context!.state!=='running')return;
      if(this.nextTime<this.context!.currentTime-.2)this.nextTime=this.context!.currentTime+.035;
      while(this.nextTime<this.context!.currentTime+.13){this.playStep(this.step++,this.nextTime);this.nextTime+=this.stepDuration();}
    };
    schedule();this.scheduler=setInterval(schedule,25);
  }
  note(midi: number,time: number,duration: number,type: OscillatorType='square',level=.07,group='music',slide: number|null=null,envelope: Envelope|null=null): void {
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
  playStep(step: number,t: number): void {
    // `s` is `step%32` and `bar` a quarter of it, so both tables are indexed
    // inside their four entries, and every chord below has four notes.
    const s=step%32,bar=Math.floor(s/8),rootNote=BASS[bar]!+this.transpose,chord=CHORDS[bar]!;
    if(this.scene==='bonus'){
      const notes=[72,76,79,84,81,79,76,74];
      if(s%2===0)this.note(notes[Math.floor(s/2)%8]!,t,.2,'square',.055);
      if(s%4===0)this.note(rootNote,t,.55,'triangle',.13);
    }else if(this.scene==='flight'){
      this.note(rootNote+24+chord[s%4]!,t,.085,'square',.07);
      if(s%4===0)this.note(rootNote,t,.32,'triangle',.19);
      if(s%8===4)this.note(rootNote+12,t,.13,'square',.035);
    }else if(this.scene==='question'||this.scene==='urgent'){
      const score=this.activeScore(),urgent=this.scene==='urgent',beat=this.stepDuration(),q=step%score.lead.length,b=Math.floor(q/8),i=q%8;
      // A score's roots and chords run one per bar and `b` is the bar index,
      // and `bassPattern`, `arpOrder` and every chord are eight, four and four.
      const bass=score.roots[b]!,harmony=score.chords[b]!,offset=score.bassPattern[i]!;
      const pluck={attack:.006,release:.07};
      // Syncopated bass: articulated, above the old sub-bass register; no drone.
      if(offset!==null)this.note(bass+offset,t,beat*(i===0?.92:.66),'triangle',i===0?.19:.13,'music',null,pluck);
      // Four dry arpeggio notes per bar, using open 9ths/6ths rather than a lament.
      if(i%2===1){
        const n=harmony[score.arpOrder?score.arpOrder[(i-1)/2]!:(i-1)/2]!;
        this.note(n,t,beat*.62,'triangle',.085,'music',null,pluck);
        this.note(n,t,beat*.5,'square',.013,'music',null,pluck);
      }
      if(score.lead[q])this.note(score.lead[q]!,t,beat*(i===6?1.22:.82),'square',.033,'music',null,{attack:.008,release:.09});
      // Tuned, synthesized percussion: a small kick and a soft clock-like click.
      // No noise samples, downloads or persistent low pad.
      if(i%4===0)this.note(48,t,.085,'sine',.09,'music',36);
      if(i%2===1)this.note(96,t,.027,'triangle',.014);
      if(i===2||i===6)this.note(84,t,.045,'triangle',.028);
      if(urgent&&i%2===0)this.note(79,t,.07,'triangle',.035);
    }else{
      if(MELODY[s])this.note(MELODY[s]!+this.transpose,t,.24,'square',.065);
      if(s%4===0)this.note(rootNote,t,.56,'triangle',.17);
      if(s%2===1)this.note(rootNote+12+chord[s%4]!,t,.14,'triangle',.09);
    }
  }
  cue(kind: string): void {
    if(!this.context||!this.unlocked||!this.enabled||!this.effects||this.paused)return;
    if(!['flight','tick','select','zoom'].includes(kind))this.stopVoices('effects');
    this.scheduleCue(kind,this.context.currentTime+.015);
  }
  // Scheduling is separate so the downloadable demo uses the exact live cues.
  scheduleCue(kind: string,t: number): void {
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
        this.note(n,t+offsets[i]!,duration,'square',.048,'effects',null,{attack:.006,release:.08});
        this.note(n,t+offsets[i]!,duration,'triangle',.058,'effects',null,{attack:.004,release:.07});
      });
      this.note(48,t,.26,'triangle',.13,'effects',null,{attack:.006,release:.09});
      this.note(55,t,.22,'triangle',.065,'effects',null,{attack:.006,release:.08});
      return;
    }
    const notes=(({bonus:[72,79,84,79,88],extraLife:[72,74,79,84,86,91],arrival:[67,72,74,79],complete:[72,76,79,84,79,84,88]}) as Record<string, number[]>)[kind];
    if(!notes)return;
    notes.forEach((n,i)=>this.note(n,t+i*.115,kind==='complete'?.32:.18,'square',.075,'effects'));
    this.note(48,t,.5,'triangle',.14,'effects');
  }
  stopVoices(group?: string): void {
    if(!this.context)return;const t=this.context.currentTime;
    for(const voice of [...this.voices]){if(group&&voice.group!==group)continue;try{voice.gain.gain.cancelScheduledValues(t);voice.gain.gain.setTargetAtTime(.00001,t,.006);voice.osc.stop(t+.025);}catch{/* Already stopped. */}}
  }
  status() {
    let rms=0;if(this.analyser){const a=new Float32Array(this.analyser.fftSize);this.analyser.getFloatTimeDomainData(a);rms=Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);}
    return {...this.settings(),scene:this.scene,paused:this.paused,unlocked:this.unlocked,failed:this.failed,state:this.context?.state||'not-started',notes:this.noteCount,rms,melody:{index:this.scoreIndex,name:this.activeScore().name,count:QUESTION_SCORES.length,startStep:this.questionStartStep,step:this.step,length:this.activeScore().lead.length,serial:this.questionSerial}};
  }
  // Only a live `AudioContext` is ever destroyed; an offline render is
  // discarded whole, and `OfflineAudioContext` has no `close`.
  destroy(): void {this.stopScheduler();this.stopVoices();if(this.context)(this.context as AudioContext).close().catch(()=>{});}
  static QUESTION_SCORE = QUESTION_SCORE;
  static QUESTION_SCORES = QUESTION_SCORES;
}
