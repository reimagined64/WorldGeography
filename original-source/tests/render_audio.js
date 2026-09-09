/* Browser-evaluated offline demo using the exact live synthesis code.
   All 21 melodies, shuffled without replacement, each from a different offset. */
async () => {
 const count=GeoAudio.QUESTION_SCORES.length,slot=6.4,duration=count*slot+.4,sr=44100;
 const ctx=new OfflineAudioContext(1,Math.ceil(duration*sr),sr),a=new GeoAudio({volume:.42}),selector=new GeoAudio({random:GeoCore.rng(600606)});
 a.connectGraph(ctx);a.unlocked=true;a.scene='question';a.master.gain.value=.42*.72;a.musicFilter.frequency.value=2700;
 const markers=[];
 for(let k=0;k<count;k++){
  selector.beginQuestion('demo:'+k);a.scoreIndex=selector.scoreIndex;a.scene='question';const offset=selector.questionStartStep,score=a.activeScore(),start=k*slot+.08,beat=a.stepDuration();
  a.musicBus.gain.setValueAtTime(.6,start);
  for(let step=0;step<18;step++)a.playStep(offset+step,start+step*beat);
  const end=start+18*beat;a.musicBus.gain.setTargetAtTime(.00001,end,.006);
  const cue=k%3===1?'wrong':k%3===2?'extraLife':'correct';a.scheduleCue(cue,end+.05);
  markers.push({slot:k+1,themeIndex:a.scoreIndex,name:score.name,offsetStep:offset,startSeconds:start,endSeconds:end,cue});
 }
 const rendered=await ctx.startRendering(),pcm=rendered.getChannelData(0),bytes=new Uint8Array(pcm.length*2),view=new DataView(bytes.buffer);
 let sum=0,peak=0,clipped=0;
 for(let i=0;i<pcm.length;i++){const t=i/sr,fade=Math.max(0,Math.min(1,t/.05,(duration-t)/.25)),v=pcm[i]*fade;sum+=v*v;peak=Math.max(peak,Math.abs(v));if(Math.abs(v)>=1)clipped++;view.setInt16(i*2,Math.max(-32768,Math.min(32767,Math.round(v*32767))),true);}
 for(const m of markers){let power=0;const left=Math.floor(m.startSeconds*sr),right=Math.floor(m.endSeconds*sr);for(let i=left;i<right;i++)power+=pcm[i]*pcm[i];m.rms=Math.sqrt(power/(right-left));}
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {data:btoa(binary),sampleRate:sr,duration,notes:a.noteCount,peak,rms:Math.sqrt(sum/pcm.length),clipped,markers};
}
