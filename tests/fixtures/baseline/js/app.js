(function(){
'use strict';
const $=id=>document.getElementById(id),Core=window.GeoCore;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const countries=JSON.parse($('country-data').textContent),map=JSON.parse($('map-data').textContent),sources=JSON.parse($('source-data').textContent),flags=JSON.parse($('flag-data').textContent);
try{Core.validateCountries(countries);}catch(e){$('side-panel').textContent='Databáze se nepodařila načíst: '+e.message;return;}
const byCode=Object.fromEntries(countries.map(c=>[c.code,c]));
const STORE={settings:'wg.settings.v1',run:'wg.run.v7',record:'wg.record.v7',audio:'wg.audio.v2'};
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
const defaults={players:1,names:['Hráč 1','Hráč 2'],difficulty:'normal',region:'all',motion:'full'};
const saved=read(STORE.settings,{});
let options={...defaults,...saved};
if(![1,2].includes(options.players))options.players=1;
if(!['easy','normal','expert'].includes(options.difficulty))options.difficulty='normal';
if(!['all',...Object.keys(Core.REGIONS)].includes(options.region))options.region='all';
delete options.visits;if(!['full','reduced'].includes(options.motion))options.motion='full';
options.names=Array.isArray(options.names)?[0,1].map(i=>String(options.names[i]||defaults.names[i]).slice(0,24)):[...defaults.names];
let game=null,view='home',selected=0,atlasCode='CZ',atlasQuery='',atlasRegion='all',record=read(STORE.record,null),lastGlobeCode=null,phase='idle',clock=null,clockIndex=-1,clockRAF=0,revealToken=0,flightKey=null,lastPersist=0,lastTickSecond=null,startingClock=false,toastTimer,storageWarningShown=false,musicPreviewSerial=0;
const audio=new GeoAudio(read(STORE.audio,{}));
const initialRun=read(STORE.run,null);
function isValidRun(g){
  try{
    if(!g||g.version!==7||g.completed||!Array.isArray(g.questions)||!g.questions.length||!Number.isInteger(g.index)||g.index<0||g.index>=g.questions.length)return false;
    if(!g.options||![1,2].includes(g.options.players)||!['easy','normal','expert'].includes(g.options.difficulty)||!['all',...Object.keys(Core.REGIONS)].includes(g.options.region)||!Array.isArray(g.options.names)||!g.options.names.every(n=>typeof n==='string'))return false;
    if(!Array.isArray(g.answers)||!Array.isArray(g.scores)||g.scores.length!==g.options.players||!g.scores.every(n=>Number.isFinite(n)&&n>=0))return false;
    if(!g.questions.every(q=>byCode[q.country]&&[...Core.TYPES,'flag'].includes(q.type)&&Array.isArray(q.options)&&q.options.every(t=>typeof t==='string')&&q.options.length===3&&new Set(q.options).size===3&&Number.isInteger(q.correct)&&q.correct>=0&&q.correct<3&&Number.isInteger(q.player)&&q.player>=0&&q.player<g.options.players&&Number.isInteger(q.visit)))return false;
    if(g.answers.length>g.index+1||!g.answers.every(a=>a&&typeof a.correct==='boolean'&&Number.isFinite(a.points)&&a.points>=0&&a.points<=Core.MAX_POINTS&&Number.isFinite(a.elapsedMs)&&a.elapsedMs>=0&&((Number.isInteger(a.selected)&&a.selected>=0&&a.selected<3)||(a.timedOut&&a.selected===null))))return false;
    for(let i=0;i<g.index;i++)if(!g.answers[i])return false;
    if(!g.review){
      if(g.questions.length!==g.index+1||!Array.isArray(g.lives)||g.lives.length!==g.options.players||!g.lives.every(n=>Number.isSafeInteger(n)&&n>=0))return false;
      if(!Array.isArray(g.earnedLives)||g.earnedLives.length!==g.options.players||!g.earnedLives.every(n=>Number.isSafeInteger(n)&&n>=0))return false;
      if(!Array.isArray(g.bonusMilestones)||g.bonusMilestones.length!==g.options.players||!g.bonusMilestones.every(n=>Number.isSafeInteger(n)&&n>=0))return false;
      const pool=new Set(Core.getPool(countries,g.options).map(c=>c.code));
      if(!Array.isArray(g.deck)||new Set(g.deck).size!==g.deck.length||!g.deck.every(code=>pool.has(code))||!Number.isSafeInteger(g.seed))return false;
      if(!Array.isArray(g.recentFlags)||g.recentFlags.length>6||!g.recentFlags.every(code=>byCode[code]))return false;
      if(!Core.validateProgress(g))return false;
    }
    return true;
  }catch{return false;}
}
if(isValidRun(initialRun)){
  game=initialRun;
  if(game.clock&&game.clock.index===game.index&&Number.isFinite(game.clock.elapsedMs)&&game.clock.elapsedMs>=0)game.clock.paused=true;
  else game.clock=null;
}
const globe=new GeoGlobe($('globe'),map);globe.setMotion(options.motion==='full');
const attemptWord=n=>n===1?'pokus':n>=2&&n<=4?'pokusy':'pokusů';
function flagImage(code,hiddenName=false,extra=''){return `<img class="country-flag ${extra}" src="${flags[code]}" alt="${hiddenName?'Vlajka k poznání':'Vlajka: '+esc(byCode[code].name)}" draggable="false" decoding="sync">`;}
function lifePips(n){return `<span class="life-pips" aria-hidden="true">${Array.from({length:5},(_,i)=>`<i class="${i<n?'filled':''}"></i>`).join('')}${n>5?`<small>+${n-5}</small>`:''}</span>`;}
function saveGame(){snapshotClock();const ok=write(STORE.run,game&&!game.completed?game:null);if(!ok&&!storageWarningShown){storageWarningShown=true;notify('Prohlížeč nepovoluje ukládání. Po zavření stránky se postup ztratí.');}}
function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function snapshotClock(){
  if(game&&clock&&clockIndex===game.index)game.clock={index:game.index,elapsedMs:clock.elapsed(),paused:phase==='paused'||(!clock.running&&game.clock?.paused===true)};
}
function stopClock(){cancelAnimationFrame(clockRAF);clockRAF=0;startingClock=false;if(clock)clock.pause();}
function renderSound(){
  const pending=audio.enabled&&!audio.unlocked,active=audio.enabled&&audio.unlocked&&!audio.paused;
  $('sound').innerHTML=`<span aria-hidden="true">${audio.enabled?'♪':'♩'}</span><span class="sound-label">${audio.enabled?'ZVUK':'TICHO'}</span>`;
  $('sound').classList.toggle('sound-on',active);$('sound').setAttribute('aria-pressed',String(audio.enabled));
  $('sound').setAttribute('aria-label',pending?'Spustit zvuk':audio.enabled?'Vypnout zvuk':'Zapnout zvuk');
  $('sound').title=(pending?'Spustit zvuk':audio.enabled?'Vypnout zvuk':'Zapnout zvuk')+' (M)';
  if($('home-sound'))$('home-sound').textContent=audio.failed?'Zvuk není dostupný v tomto prohlížeči.':!audio.enabled?'Zvuk vypnutý · klávesou M jej zapnete.':pending?'♫ Hudba a zvuky se spustí se hrou.':'♫ Zvuk zapnutý · klávesou M jej ztišíte.';
}
audio.onChange=renderSound;
function leaveGame(){
  if(view!=='game')return;
  if(phase==='question'){stopClock();phase='paused';snapshotClock();}
  if(phase==='flying'){globe.cancelFlight();revealToken++;flightKey=null;}
  saveGame();phase='idle';$('flight-status').hidden=true;$('mobile-hud').hidden=true;
  document.body.classList.remove('flying','question-paused','flag-question');
  document.querySelectorAll('.globe-controls button').forEach(b=>b.disabled=false);
}
function setView(next){
  if(next!=='game')leaveGame();view=next;
  document.body.classList.toggle('game-active',next==='game');document.body.classList.toggle('atlas-active',next==='atlas');
  $('main-view').hidden=next==='results';$('results-view').hidden=next!=='results';$('nav-atlas').classList.toggle('active',next==='atlas');$('nav-play').classList.toggle('active',next!=='atlas');
  if(next!=='game'){audio.setPaused(document.hidden);audio.setScene(next==='results'?'results':'home');}
}
function coords(c){return `${Math.abs(c.lat).toFixed(1)}° ${c.lat>=0?'N':'S'} / ${Math.abs(c.lon).toFixed(1)}° ${c.lon>=0?'E':'W'}`;}
function captureSettings(){['p1-name','p2-name'].forEach((id,i)=>{if($(id))options.names[i]=($(id).value.trim()||defaults.names[i]).slice(0,24);});if($('difficulty'))options.difficulty=$('difficulty').value;if($('region'))options.region=$('region').value;if($('motion-mode'))options.motion=$('motion-mode').value;write(STORE.settings,options);}
function regionOptions(value){return `<option value="all"${value==='all'?' selected':''}>Celý svět</option>`+Object.entries(Core.REGIONS).map(([key,label])=>`<option value="${key}"${value===key?' selected':''}>${label}</option>`).join('');}
function renderHome(){
  setView('home');lastGlobeCode=null;globe.home();globe.setMotion(options.motion==='full');$('globe').setAttribute('aria-label','Otočný glóbus světa. Táhněte pro otočení, použijte plus a minus pro přiblížení.');
  $('world-heading').innerHTML=`<div class="eyebrow accent">ARCADE EDITION / VERZE 7.0</div><h1>Tři otočky.<br><em>A další šance.</em></h1><p class="intro-line">Zeměpisná klasika inspirovaná Commodorem 64.<br>Hrajte, dokud vám zbývá alespoň jeden pokus.</p>`;
  $('world-caption').innerHTML=`<div class="globe-stats"><div><strong>195</strong><span>zemí a vlajek</span></div><div><strong>5</strong><span>počátečních pokusů</span></div><div><strong>∞</strong><span>otázek ve hře</span></div></div><div class="coord">1985 → 2026<br>VLAJKOVÝ BONUS</div>`;
  $('side-panel').innerHTML=`<div class="section-title"><h2>Vaše příští expedice</h2><span class="number">01 /</span></div><p class="panel-intro">Pět pokusů. Žádný pevný počet kol.</p>
  <div class="settings-section"><span class="field-label" id="players-label">Počet hráčů</span><div class="segmented" role="group" aria-labelledby="players-label"><button data-players="1" aria-pressed="${options.players===1}">Jeden hráč</button><button data-players="2" aria-pressed="${options.players===2}">Dva hráči</button></div>
  <div class="players-fields"><label><span class="field-label">${options.players===2?'První hráč':'Vaše jméno'}</span><input id="p1-name" type="text" maxlength="24" value="${esc(options.names[0])}" autocomplete="off"></label>${options.players===2?`<label><span class="field-label">Druhý hráč</span><input id="p2-name" type="text" maxlength="24" value="${esc(options.names[1])}" autocomplete="off"></label>`:''}</div></div>
  <div class="setting-row"><label><span class="field-label">Obtížnost</span><select id="difficulty"><option value="easy"${options.difficulty==='easy'?' selected':''}>Průzkumník</option><option value="normal"${options.difficulty==='normal'?' selected':''}>Cestovatel</option><option value="expert"${options.difficulty==='expert'?' selected':''}>Kartograf</option></select></label><label><span class="field-label">Oblast</span><select id="region">${regionOptions(options.region)}</select></label></div>
  <div class="survival-rule"><div class="survival-rule-top"><span>NA STARTU</span>${lifePips(5)}<strong>5 pokusů</strong></div><p>Nový stát: <b>−1 pokus za všech 5 otázek.</b><br>Každých 10 000 bodů: <b>+2 pokusy hned</b> a po dokončení státu vlajkový bonus o <b>body a další +1 pokus.</b> Chyby pokusy neodebírají.</p></div>
  <label class="motion-setting"><span class="field-label">Oddech před zemí i bonusem · 12 sekund</span><select id="motion-mode"><option value="full"${options.motion==='full'?' selected':''}>Plné otáčení · 3 celé otočky a přiblížení</option><option value="reduced"${options.motion==='reduced'?' selected':''}>Klidový režim · stejný oddech, bez pohybu</option></select></label>
  <p class="length-note" id="length-note"></p><div class="category-row">${[...Core.TYPES,'flag'].map((type,i)=>`<span class="category-chip ${type==='flag'?'bonus-chip':''}">${type==='flag'?'+':String(i+1).padStart(2,'0')} ${Core.LABELS[type]}</span>`).join('')}</div>
  <button id="start" class="primary"><span>Zahájit expedici</span><span class="arrow" aria-hidden="true">→</span></button>
  ${game&&!game.completed?`<button id="resume" class="secondary full">Pokračovat · otázka ${game.index+1}${game.review?' · trénink':` · ${game.lives.join(' / ')} pokusů`}</button>`:''}
  <p class="sound-note" id="home-sound"></p><div class="setup-bottom"><span id="setup-time"></span><span>${record?`REKORD <strong>${Number(record.points||0).toLocaleString('cs-CZ')} BODŮ</strong>`:'<strong>AŽ 1 000 BODŮ</strong> ZA ODPOVĚĎ'}</span></div>`;
  document.querySelectorAll('[data-players]').forEach(b=>b.onclick=()=>{captureSettings();options.players=Number(b.dataset.players);write(STORE.settings,options);renderHome();});
  ['difficulty','region','motion-mode'].forEach(id=>$(id).onchange=()=>{captureSettings();globe.setMotion(options.motion==='full');updateLengthNote();});
  ['p1-name','p2-name'].forEach(id=>{if($(id))$(id).onchange=captureSettings;});
  $('start').onclick=()=>{captureSettings();if(game&&!game.completed)confirmNew();else startGame();};
  if($('resume'))$('resume').onclick=()=>{audio.unlock();lastGlobeCode=null;renderGame();};
  updateLengthNote();renderSound();
}
function updateLengthNote(){
  $('length-note').textContent=`Výběr z ${Core.getPool(countries,options).length} zemí · 100 bodů základ + až 900 za rychlost.`;
  $('setup-time').textContent=`LIMIT ${Core.TIME_LIMITS[options.difficulty]/1000} s / OTÁZKA`;
}
function startGame(){audio.unlock();stopClock();clock=null;clockIndex=-1;revealToken++;flightKey=null;phase='idle';try{game=Core.makeGame(countries,{...options,names:[...options.names]});lastGlobeCode=null;selected=0;saveGame();renderGame();scrollQuestion(true);}catch(e){notify(e.message);}}
function confirmNew(){openDialog(`<h2 id="dialog-title">Zahájit novou expedici?</h2><p>Dosavadní rozehraná hra se nahradí. Uložený nejlepší výsledek zůstane zachovaný.</p><div class="dialog-controls"><button class="secondary" id="cancel-new">Zpět</button><button class="primary" id="confirm-new">Nová expedice →</button></div>`);$('cancel-new').onclick=()=>$('dialog').close();$('confirm-new').onclick=()=>{$('dialog').close();startGame();};}
const seconds=ms=>(Math.ceil(Math.max(0,ms)/100)/10).toLocaleString('cs-CZ',{minimumFractionDigits:1,maximumFractionDigits:1});
const pointText=n=>n.toLocaleString('cs-CZ');
function renderWorldHeader(q,c,answer,flying=false){
  const bonus=q.type==='flag',paused=phase==='paused',isHidden=(q.type==='country'&&!answer)||(bonus&&!answer)||flying||paused;
  document.body.classList.toggle('flag-question',bonus&&!flying&&!paused);
  $('globe').setAttribute('aria-label',flying?'Glóbus se třikrát otáčí. Probíhá oddech před zemí nebo vlajkovým bonusem.':bonus&&!answer?'Neutrální glóbus. Poloha země vlajkového bonusu je skrytá.':isHidden?'Na glóbu je zvýrazněna hledaná země. Její polohu označuje bod.':`Glóbus – ${c.name}. Její polohu označuje bod.`);
  $('world-heading').innerHTML=`<div class="game-heading"><div><div class="eyebrow accent">${game.review?'TRÉNINK / OPAKOVÁNÍ CHYB':'HRA NA POKUSY / '+esc(Core.REGIONS[game.options.region]||'CELÝ SVĚT')}</div><h1>${game.review?'Ještě jednou.':bonus?'Vlajkový <em>bonus.</em>':`Zastávka <span>${String(q.visit+1).padStart(2,'0')}</span>`}</h1></div><div class="round-note">${game.review?`${game.index+1} / ${game.questions.length}`:'BEZ LIMITU KOL'}</div></div>
  <div class="score-chips">${game.scores.map((score,i)=>`<div class="score-chip ${q.player===i?'active':''} ${!game.review&&game.lives[i]===0&&i!==q.player?'eliminated':''}"><div class="score-top"><span class="player-name">${esc(game.options.names[i]||`Hráč ${i+1}`)}</span><b>${pointText(score)}</b></div>${game.review?'':`<div class="score-lives">${lifePips(game.lives[i])}<span data-player-lives="${i}">${game.lives[i]===0?(i===q.player&&!game.gameOver?(q.type==='flag'?'0 · BONUS O ZÁCHRANU':'0 · STÁT JE ZAPLACEN'):'BEZ DALŠÍHO POKUSU'):`${game.lives[i]} ${attemptWord(game.lives[i])}`}</span></div>`}</div>`).join('')}</div>`;
  const name=flying?'Chvíle na oddech.':paused?'Pauza':bonus&&!answer?'Poznáte vlajku?':isHidden?'Neznámá země':c.name;
  const sub=flying?'3 OTOČKY → ZAMĚŘENÍ → PŘIBLÍŽENÍ':paused?'ODPOČET JE POZASTAVEN':bonus&&!answer?'SPRÁVNĚ = BODY A +1 POKUS':c.code==='AF'?'REPUBLIKÁNSKÁ VLAJKA · VIZ ATLAS':isHidden&&game.options.difficulty==='expert'?'KARTOGRAF / POLOHA NA GLÓBU':Core.REGIONS[c.region];
  $('world-caption').innerHTML=`<div class="country-caption">${!flying&&!paused&&!bonus?flagImage(c.code,isHidden):''}<div><div class="caption-title">${esc(name)}</div><div class="caption-sub">${esc(sub)}</div></div></div><div class="coord">${flying||paused||bonus?'':isHidden&&game.options.difficulty==='expert'?'POLOHA NA GLÓBU':coords(c)}</div>`;
}
function questionHeader(q){
  const bonus=q.type==='flag',step=Core.TYPES.indexOf(q.type),lives=game.review?null:game.lives[q.player];
  const threshold=game.review?0:Core.nextBonusThreshold(game,q.player),remaining=threshold-game.scores[q.player];
  const pending=game.review?0:game.pendingBonuses[q.player].length;
  const bonusProgress=bonus?'SPRÁVNĚ = BODY A +1':pending?`VLAJKA ČEKÁ PO STÁTU${pending>1?' ×'+pending:''}`:`K +2 A VLAJCE: ${pointText(Math.max(0,remaining))} B.`;
  const caption=game.review?`OPAKOVÁNÍ ${game.index+1} / ${game.questions.length}`:bonus?`BONUS ZA ${pointText(q.bonusThreshold)} BODŮ`:`OTÁZKA ${String(game.index+1).padStart(2,'0')}`;
  return `<div class="question-head"><span>${caption}</span><strong>Na tahu: ${esc(game.options.names[q.player]||`Hráč ${q.player+1}`)}</strong></div><div class="steps" aria-label="${bonus?'Samostatný vlajkový bonus':`${step+1}. okruh z pěti`}">${(bonus?['flag']:Core.TYPES).map((_,i)=>`<span class="step ${bonus?'current bonus-step':i<step?'done':i===step?'current':''}"></span>`).join('')}</div>${game.review?'':`<div class="question-lives"><span>${lifePips(lives)} <b>${lives}</b> ${attemptWord(lives)}</span><span id="bonus-progress" data-next-bonus="${threshold}" title="Za ${pointText(threshold)} bodů +2 pokusy a vlajka po dokončení země">${bonusProgress}</span></div>`}`;
}
function timerPanel(answer=null){
  const limit=Core.timeLimit(game),elapsed=answer?.elapsedMs??clock?.elapsed()??0,remaining=limit?Math.max(0,limit-elapsed):0;
  const pts=answer?answer.points:Core.pointsForTime(elapsed,limit),pending=phase==='flying',paused=phase==='paused';
  return `<div class="timing-panel ${answer?'finished':''}" id="timing-panel"><div class="time-readout"><span class="instrument-label">${!limit?'TRÉNINK':pending?'ODPOČET ČEKÁ':paused?'POZASTAVENO':answer?'ZBÝVALO':'ČAS NA ODPOVĚĎ'}</span><strong><span data-time-readout>${limit?seconds(remaining):'∞'}</span><small>${limit?'s':''}</small></strong></div><div class="reward-readout"><span class="instrument-label">${answer?'ZÍSKÁNO':'TEĎ HRAJETE O'}</span><strong><span data-points-readout>${pointText(pts)}</span><small>bodů</small></strong></div>${phase==='question'?'<button id="pause-game" class="pause-button" aria-label="Pozastavit otázku" title="Pauza (P)">Ⅱ</button>':''}<div class="time-track" id="time-track" role="progressbar" aria-label="Zbývající čas" aria-valuemin="0" aria-valuemax="${limit/1000||1}" aria-valuenow="${limit?Math.ceil(remaining/1000):1}"><span id="time-fill" style="transform:scaleX(${limit?remaining/limit:1})"></span></div><div class="timing-note">${!limit?'Opakování bez limitu · 100 bodů za správnou odpověď':pending?'Čas začne až po přiblížení a zobrazení otázky.':answer?'Výsledek této odpovědi je uložen.':paused?'Čas ani body během pauzy neubývají.':'100 bodů základ + až 900 bodů za rychlost'}</div></div>`;
}
function footer(){return `<div class="game-footer"><span class="coord">${phase==='flying'?'ODDECH PŘED ZEMÍ / BONUSEM':phase==='paused'?'PAUZA':phase==='feedback'?'ODPOVĚĎ VYHODNOCENA':game.review?'TRÉNINK BEZ LIMITU':'RYCHLOST ROZHODUJE'}</span><button id="back-home" class="text-button">Uložit a odejít</button></div>`;}
function bindExit(){$('back-home').onclick=()=>{renderHome();window.scrollTo({top:0,behavior:'auto'});};}
function beginFlight(q,c){
  const key=`${game.created}:${game.index}`;if(phase==='flying'&&flightKey===key&&globe.flight)return;
  stopClock();clock=null;clockIndex=-1;game.clock=null;phase='flying';flightKey=key;const token=++revealToken,bonus=q.type==='flag';
  globe.setMotion(options.motion==='full');
  document.body.classList.add('flying');document.body.classList.remove('question-paused','flag-question');$('mobile-hud').hidden=true;
  document.querySelectorAll('.globe-controls button').forEach(b=>b.disabled=true);
  renderWorldHeader(q,c,null,true);
  $('side-panel').innerHTML=questionHeader(q)+`<div class="flight-card"><div class="eyebrow accent">${bonus?'ODDECH PŘED VLAJKOVÝM BONUSEM':'ODDECH PŘED DALŠÍ ZEMÍ'}</div><div class="rest-countdown"><strong id="rest-seconds">12,0</strong><span>sekund</span></div><h2 id="flight-title">Svět počká.</h2><p id="flight-description">${bonus?'Tři celé otočky zeměkoule. Potom poznávání vlajky.':'Tři celé otočky zeměkoule. Pak zaměření a přiblížení.'}</p><div class="rest-track" role="progressbar" aria-label="Průběh oddechu" aria-valuemin="0" aria-valuemax="12" aria-valuenow="0" id="rest-track"><span id="rest-fill"></span></div><div class="flight-steps"><span data-flight-step="spin">01 / TŘI OTOČKY</span><span data-flight-step="settle">02 / ZAMĚŘENÍ</span><span data-flight-step="zoom">03 / ${bonus?'BONUS':'PŘIBLÍŽENÍ'}</span></div><div class="rest-detail" id="rest-detail">Odpočet otázky ještě neběží.</div><p class="flight-footnote">${bonus?'Bonus nestojí žádný pokus.':'Nový stát: −1 pokus již zaplacen za všech pět otázek.'}<br>Čas otázky během oddechu neběží.</p><button class="text-button motion-flight" id="flight-motion">${options.motion==='full'?'Omezit pohyb':'Zapnout plné otáčení'}</button></div>`+footer();bindExit();
  $('flight-motion').onclick=()=>{options.motion=options.motion==='full'?'reduced':'full';write(STORE.settings,options);globe.setMotion(options.motion==='full');$('flight-motion').textContent=options.motion==='full'?'Omezit pohyb':'Zapnout plné otáčení';};
  $('flight-status').hidden=false;$('flight-status').textContent='ODDECH · 12 s';
  audio.setRegion(c.region);audio.setScene('flight');audio.setPaused(document.hidden||$('dialog').open);audio.cue('flight');
  globe.reveal(c,{neutral:bonus,onStage:stage=>{
    if(token!==revealToken||view!=='game')return;
    const text={depart:['Chvíle na oddech.','Oddalujeme glóbus před dalším putováním.'],spin:['Svět se točí.','Tři celé otočky. Žádný spěch, odpočet otázky čeká.'],settle:[bonus?'Zastavujeme glóbus.':'Zaměřujeme cíl.',bonus?'Poloha země zůstává utajená.':'Otáčení zpomaluje a glóbus se zastaví.'],zoom:[bonus?'Přichází vlajkový bonus.':'Přibližujeme zemi.',bonus?'Poznáte vlajku? Správná odpověď přidá body i pokus.':'Připravte se. Odpočet začne až po příletu.']}[stage];
    if($('flight-title'))$('flight-title').textContent=text[0];if($('flight-description'))$('flight-description').textContent=text[1];
    document.querySelectorAll('[data-flight-step]').forEach(e=>e.classList.toggle('active',e.dataset.flightStep===(stage==='depart'?'spin':stage)));
    if(stage==='zoom')audio.cue(bonus?'bonus':'zoom');
  },onProgress:state=>{
    if(token!==revealToken||!$('rest-seconds'))return;
    $('rest-seconds').textContent=seconds(state.remainingMs);$('rest-fill').style.transform=`scaleX(${state.progress})`;
    $('rest-track').setAttribute('aria-valuenow',String(Math.floor(state.elapsed/1000)));
    const label=!state.motion?'KLIDOVÝ REŽIM':state.stage==='spin'?`OTOČKA ${Math.min(3,state.turnsCompleted+1)} / 3`:state.stage==='settle'?'ZAMĚŘENÍ':state.stage==='zoom'?(bonus?'VLAJKOVÝ BONUS':'PŘIBLÍŽENÍ'):'ODLET';
    $('flight-status').textContent=`${label} · ODDECH ${Math.ceil(state.remainingMs/1000)} s`;
    $('rest-detail').textContent=state.motion?`Dokončené otočky: ${state.turnsCompleted} / 3 · odpočet otázky čeká`:'Bez pohybu · délka oddechu zůstává 12 sekund';
  },onComplete:()=>{
    if(token!==revealToken||view!=='game'||game.questions[game.index]!==q)return;
    game.revealedIndex=game.index;lastGlobeCode=bonus?'__bonus__':c.code;flightKey=null;phase='question';$('flight-status').hidden=true;document.body.classList.remove('flying');
    document.querySelectorAll('.globe-controls button').forEach(b=>b.disabled=false);
    audio.cue(bonus?'bonus':'arrival');renderGame();
    if(innerWidth<701)$('side-panel').scrollIntoView({block:'start',behavior:'auto'});
    saveGame();
  }});
  if(document.hidden||$('dialog').open)globe.pauseFlight(true);
  if(innerWidth<701)requestAnimationFrame(()=>document.querySelector('.canvas-wrap').scrollIntoView({block:'start',behavior:'auto'}));
  else window.scrollTo({top:0,behavior:'auto'});
  saveGame();
}
function ensureClock(){
  if(clock&&clockIndex===game.index)return;
  stopClock();const saved=game.clock?.index===game.index?game.clock:null;
  clock=new GeoClock(Core.timeLimit(game),saved?.elapsedMs||0);clockIndex=game.index;
  game.clock={index:game.index,elapsedMs:clock.elapsed(),paused:saved?.paused===true};lastTickSecond=null;
}
function renderGame(){
  if(!game||game.completed){if(game?.completed)renderResults();else renderHome();return;}
  setView('game');const q=game.questions[game.index],c=byCode[q.country],answer=game.answers[game.index],bonus=q.type==='flag',step=Core.TYPES.indexOf(q.type);
  if(!answer&&game.revealedIndex!==game.index){
    if(Core.needsFlight(game)){beginFlight(q,c);return;}
    game.revealedIndex=game.index;phase='question';
    audio.setRegion(byCode[q.anchor||q.country].region);
    if(bonus)audio.cue('bonus');
  }
  if(bonus&&!answer){if(lastGlobeCode!=='__bonus__'){globe.present(null);lastGlobeCode='__bonus__';}}
  else if(lastGlobeCode!==c.code){globe.present(c);lastGlobeCode=c.code;}
  if(answer){stopClock();phase='feedback';}else{ensureClock();phase=game.clock.paused?'paused':'question';}
  document.body.classList.remove('flying');document.body.classList.toggle('question-paused',phase==='paused');$('flight-status').hidden=true;
  renderWorldHeader(q,c,answer);
  if(phase==='paused'){
    $('side-panel').innerHTML=questionHeader(q)+timerPanel()+`<div class="paused-card"><span class="pause-emblem" aria-hidden="true">Ⅱ</span><h2>Expedice počká.</h2><p>Otázka i vlajka jsou schované. Čas, pokusy a dostupné body zůstávají beze změny.</p><button id="resume-clock" class="primary"><span>Pokračovat v otázce</span><span aria-hidden="true">→</span></button><p class="pause-shortcut">Klávesa P také obnoví hru.</p></div>`+footer();
    $('resume-clock').onclick=resumeQuestion;bindExit();$('mobile-hud').hidden=true;audio.setPaused(true);return;
  }
  const end=game.gameOver||(game.review&&game.index===game.questions.length-1);
  const lifeParts=[];
  if(answer&&!game.review){
    if(answer.scoreLifeDelta)lifeParts.push(`Bodová hranice ${answer.milestoneThresholds.map(pointText).join(' / ')}: +${answer.scoreLifeDelta} ${attemptWord(answer.scoreLifeDelta)}. ${bonus?'Další vlajkový bonus je připraven.':'Vlajka čeká po dokončení země.'}`);
    if(answer.flagLifeDelta)lifeParts.push('Správná vlajka: +1 další pokus.');
    if(!answer.correct)lifeParts.push(bonus?'Bonus nevyšel. Pokus se neodebírá.':'Pokus se za chybu ani vypršení času neodebírá.');
    lifeParts.push(`Na další země zbývá ${answer.livesAfter} ${attemptWord(answer.livesAfter)}.${answer.livesAfter===0&&!game.gameOver&&!bonus&&Core.TYPES.indexOf(q.type)<4?' Tuto zemi ještě dohrajete.':''}`);
  }
  const lifeMessage=lifeParts.join(' ');
  const next=game.review?null:Core.nextTurn(game);
  const nextLabel=end?'Výsledky hry':game.review?'Další otázka':next.kind==='bonus'?`Vlajkový bonus · 12 s oddechu`:next.kind==='country'?(next.player!==q.player?'Předat tah · 12 s oddechu':'Další země · 12 s oddechu'):bonus?'Pokračovat v této zemi':'Další otázka';
  $('side-panel').innerHTML=questionHeader(q)+timerPanel(answer)+`<div class="question-category"><span class="category-number">${bonus?'+1':step+1}</span>${Core.LABELS[q.type]}</div><h2 id="question-title" class="question-title" tabindex="-1">${esc(q.prompt)}</h2>
  ${bonus?`<div class="bonus-flag-card">${flagImage(c.code,!answer,'bonus-flag')}<div class="bonus-reward">${game.review?'PROCVIČOVÁNÍ VLAJEK':'BODY A +1 POKUS ZA SPRÁVNOU ODPOVĚĎ'}</div></div>`:''}
  <div class="answer-list" role="group" aria-labelledby="question-title">${q.options.map((text,i)=>{const cls=answer?(i===q.correct?'correct':i===answer.selected?'wrong':'dim'):(selected===i?'key-selected':'');return `<button class="answer ${cls}" data-answer="${i}" ${answer?'disabled':''}><span class="answer-letter" aria-hidden="true">${['A','B','C'][i]}</span><span class="answer-text">${esc(text)}</span><span class="answer-mark" aria-hidden="true">${answer?(i===q.correct?'✓':i===answer.selected?'×':''):''}</span></button>`;}).join('')}</div>
  ${answer?`<div class="feedback" aria-live="polite"><div class="feedback-title ${answer.correct?'':'incorrect'}">${answer.timedOut?'Čas vypršel. +0 bodů':answer.correct?`Správně. +${pointText(answer.points)} bodů`:'Tentokrát ne. +0 bodů'}</div>${lifeMessage?`<div class="life-feedback ${answer.lifeDelta>0?'life-earned':answer.lifeDelta<0?'life-lost':''}">${esc(lifeMessage)}${game.gameOver?' Všem hráčům došly pokusy.':''}</div>`:''}<div class="answer-timing">${answer.timedOut?'Bez odpovědi v limitu':`Odpověď za ${seconds(answer.elapsedMs)} s`}${answer.correct?` · ${answer.basePoints} základ + ${pointText(answer.bonusPoints||0)} časový bonus`:''}</div><p>${esc(q.explanation)}</p>${q.source==='worldometer-un-2026'?'<a href="https://www.worldometers.info/world-population/population-by-country/" target="_blank" rel="noopener noreferrer">Populační zdroj: Worldometer / OSN ↗</a>':''}<button id="next" class="primary"><span>${nextLabel}</span><span class="arrow" aria-hidden="true">→</span></button></div>`:`<p class="question-tip">Zvolte jednu odpověď. <span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span> / <span class="kbd">A</span> <span class="kbd">B</span> <span class="kbd">C</span> · <span class="kbd">P</span> pauza</p>`}`+footer();
  document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>choose(Number(b.dataset.answer)));
  if($('next'))$('next').onclick=nextQuestion;if($('pause-game'))$('pause-game').onclick=pauseQuestion;bindExit();
  if(!answer&&!bonus)audio.beginQuestion(`${game.created}:${game.index}`);
  audio.setPaused(document.hidden||$('dialog').open);audio.setScene(answer?'feedback':bonus?'bonus':'question');
  renderMobileHud(answer);if(!answer)startClockAfterPaint();
}
function renderMobileHud(answer){
  const limit=Core.timeLimit(game),q=game.questions[game.index];$('mobile-hud').hidden=!!answer||phase!=='question';
  if($('mobile-hud').hidden)return;
  $('mobile-hud').innerHTML=`<div><span>ZBÝVÁ</span><strong><b data-time-readout>${limit?seconds(clock.remaining()):'∞'}</b>${limit?' s':''}</strong></div><div><span>ODMĚNA</span><strong><b data-points-readout>${pointText(Core.pointsForTime(clock.elapsed(),limit))}</b> b.</strong></div>${game.review?'':`<div class="mobile-lives"><span>POKUSY</span><strong>${game.lives[q.player]}${q.type==='flag'?' / +1':''}</strong></div>`}<button id="mobile-pause" class="pause-button" aria-label="Pozastavit otázku">Ⅱ</button>`;
  $('mobile-pause').onclick=pauseQuestion;
}
function startClockAfterPaint(){
  if(clock.running){if(!clockRAF)tickClock();return;}if(startingClock)return;
  startingClock=true;const expected=clock;
  const images=[...$('main-view').querySelectorAll('img.country-flag')];
  Promise.all(images.map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve())).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(clock!==expected||phase!=='question'||view!=='game'){startingClock=false;return;}
    startingClock=false;if(document.hidden||$('dialog').open){pauseQuestion();return;}
    clock.start();game.clock.paused=false;lastPersist=performance.now();tickClock();saveGame();
  })));
}
function tickClock(){
  clockRAF=0;if(phase!=='question'||view!=='game'||!clock)return;
  const limit=Core.timeLimit(game),elapsed=clock.elapsed(),remaining=limit?Math.max(0,limit-elapsed):Infinity;
  if(limit&&remaining<=0){choose(null);return;}
  document.querySelectorAll('[data-time-readout]').forEach(e=>e.textContent=limit?seconds(remaining):'∞');
  document.querySelectorAll('[data-points-readout]').forEach(e=>e.textContent=pointText(Core.pointsForTime(elapsed,limit)));
  if($('time-fill'))$('time-fill').style.transform=`scaleX(${limit?remaining/limit:1})`;
  if($('time-track'))$('time-track').setAttribute('aria-valuenow',String(limit?Math.ceil(remaining/1000):1));
  const urgent=limit>0&&remaining<=5000;$('timing-panel')?.classList.toggle('urgent',urgent);$('mobile-hud').classList.toggle('urgent',urgent);
  if(urgent){if(game.questions[game.index].type!=='flag')audio.setScene('urgent');const sec=Math.ceil(remaining/1000);if(sec!==lastTickSecond){audio.cue('tick');lastTickSecond=sec;}}
  if(performance.now()-lastPersist>=1000){saveGame();lastPersist=performance.now();}
  clockRAF=requestAnimationFrame(tickClock);
}
function pauseQuestion(){
  if(phase!=='question'||!game||game.answers[game.index])return;
  if(clock&&Core.timeLimit(game)&&clock.remaining()<=0){choose(null);return;}
  stopClock();phase='paused';snapshotClock();game.clock.paused=true;saveGame();renderGame();
}
function resumeQuestion(){
  if(phase!=='paused'||!game)return;audio.unlock();game.clock.paused=false;phase='question';audio.setPaused(false);renderGame();
}
function choose(index){
  if(view!=='game'||!game||phase!=='question'||!clock||(!clock.running&&clock.remaining()>0)||$('dialog').open||document.hidden)return;
  const result=Core.submit(game,index,clock.elapsed());if(!result)return;
  stopClock();phase='feedback';audio.setScene('feedback');audio.cue(result.lifeDelta>0?'extraLife':result.timedOut?'timeout':result.correct?'correct':'wrong');saveGame();renderGame();
  $('next')?.focus({preventScroll:true});if(innerWidth<701)setTimeout(()=>{$('next')?.scrollIntoView({block:'nearest',behavior:'auto'});},50);
}
function nextQuestion(){
  if(!game||!game.answers[game.index])return;selected=0;stopClock();clock=null;clockIndex=-1;phase='idle';
  if(Core.advance(game,countries)){saveGame();renderGame();scrollQuestion(false);}else{saveGame();renderResults();audio.cue('complete');window.scrollTo({top:0,behavior:'auto'});}
}
function scrollQuestion(newVisit){if(phase==='flying')return;if(innerWidth<701){setTimeout(()=>{(newVisit?$('world-heading'):$('side-panel')).scrollIntoView({block:'start',behavior:'auto'});},20);}else if(newVisit)window.scrollTo({top:0,behavior:'auto'});}
function renderResults(){
  if(!game)return;setView('results');
  const timed=game.answers.filter(a=>Number.isFinite(a?.elapsedMs)&&!a.timedOut),average=timed.length?timed.reduce((sum,a)=>sum+a.elapsedMs,0)/timed.length:null,bonus=game.answers.reduce((sum,a)=>sum+(a?.bonusPoints||0),0),timeouts=game.answers.filter(a=>a?.timedOut).length;
  const correct=game.answers.filter(a=>a?.correct).length,total=game.answers.length,accuracy=total?Math.round(correct/total*100):0,points=game.scores.reduce((a,b)=>a+b,0),wrong=game.questions.map((q,i)=>({q,a:game.answers[i],i})).filter(x=>x.a&&!x.a.correct),bestScore=Math.max(...game.scores);
  if(!game.review&&(!record||bestScore>(record.points||0))){record={points:bestScore,total,date:new Date().toISOString()};write(STORE.record,record);}
  let title=game.review?'Znalosti doplněny.':'Pokusy došly. Svět zůstává.';
  let sub=`${correct} správných odpovědí z ${total}. ${game.review?'Trénink neovlivňuje rekordy ani pokusy.':'Začněte novou výpravu nebo procvičte chyby.'}`;
  if(game.options.players===2){title=game.scores[0]===game.scores[1]?'Bodová remíza.':`Vítězí ${game.options.names[game.scores[0]>game.scores[1]?0:1]}.`;sub='Oběma hráčům došly pokusy. O vítězi rozhoduje celkový počet bodů.';}
  $('results-view').innerHTML=`<div class="result-wrap"><div class="result-top"><div class="stamp" aria-hidden="true">◎</div><div class="eyebrow accent">${game.review?'OPAKOVÁNÍ DOKONČENO':'KONEC HRY / VYČERPANÉ POKUSY'}</div><h1>${esc(title)}</h1><p>${esc(sub)}</p>${game.options.players===2?`<div class="duel-result">${game.scores.map((s,i)=>`<span>${esc(game.options.names[i])} <strong>${pointText(s)}</strong> bodů<br>${game.answers.filter(a=>a.player===i).length} odpovědí · +${game.earnedLives[i]} pokusů z bodů a vlajek</span>`).join('')}</div>`:''}</div>
  <div class="result-stats"><div class="result-stat"><strong>${pointText(points)}</strong><span>CELKEM BODŮ</span></div><div class="result-stat"><strong>${accuracy} %</strong><span>ÚSPĚŠNOST</span></div><div class="result-stat"><strong>${game.review?(average===null?'—':seconds(average)+' s'):'+'+game.earnedLives.reduce((a,b)=>a+b,0)}</strong><span>${game.review?'PRŮMĚRNÝ ČAS':'POKUSŮ Z BODŮ A VLAJEK'}</span></div></div>
  <div class="result-timing-summary">${new Set(game.questions.filter(q=>q.type!=='flag').map(q=>q.country)).size} navštívených zemí · <strong>${pointText(bonus)} bodů za rychlost</strong> · ${timeouts}× vypršel čas · průměr ${average===null?'—':seconds(average)+' s'}</div>
  <div class="result-columns"><div><h2>Jak se vám dařilo</h2>${[...Core.TYPES,'flag'].map(type=>{const qs=game.questions.map((q,i)=>({q,i})).filter(x=>x.q.type===type&&game.answers[x.i]),num=qs.filter(x=>game.answers[x.i].correct).length;return `<div class="category-result"><div class="bar-label"><span>${Core.LABELS[type]}</span><span>${num} / ${qs.length}</span></div><div class="bar"><span style="width:${qs.length?num/qs.length*100:0}%"></span></div></div>`;}).join('')}</div><div><h2>${wrong.length?'Co stojí za zopakování':'Bez jediné chyby'}</h2><div class="mistake-list">${wrong.map(({q,a})=>`<div class="mistake"><div class="mistake-country">${flagImage(q.country)}<strong>${esc(byCode[q.country].name)} · ${Core.LABELS[q.type]}</strong></div><small>${esc(q.prompt)}</small><span class="mistake-answer">✓ ${esc(q.options[q.correct])}</span><small>Vaše odpověď: ${a.timedOut?'Vypršel čas':esc(q.options[a.selected]??'—')}</small></div>`).join('')}</div></div></div>
  <div class="result-actions"><button id="again" class="primary"><span>Nová expedice</span><span class="arrow">→</span></button>${wrong.length?'<button id="review" class="secondary">Procvičit chyby · 1 hráč</button>':''}<button id="results-atlas" class="secondary">Prozkoumat atlas</button></div></div>`;
  $('again').onclick=()=>{renderHome();window.scrollTo({top:0,behavior:'auto'});};$('results-atlas').onclick=()=>{renderAtlas();window.scrollTo({top:0,behavior:'auto'});};
  if($('review'))$('review').onclick=()=>{
    const questions=wrong.map(({q},i)=>({...Core.makeQuestion(byCode[q.country],q.type,countries,game.options.difficulty),visit:i,player:0}));
    stopClock();clock=null;clockIndex=-1;phase='idle';game={version:7,revealedIndex:null,clock:null,review:true,options:{...game.options,players:1,names:['Trénink']},questions,index:0,answers:[],scores:[0],created:new Date().toISOString(),completed:false};lastGlobeCode=null;selected=0;saveGame();renderGame();scrollQuestion(true);
  };
}
const normalize=t=>String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function renderAtlas(){
  setView('atlas');$('world-heading').innerHTML=`<div class="atlas-heading"><div class="eyebrow accent">OTEVŘENÝ ATLAS / 195 ZEMÍ</div><h1>Nejdřív poznat.<br><em>Potom odpovědět.</em></h1><p class="intro-line">Najděte si zemi a prohlédněte si její údaje.<br>Vaše rozehraná expedice zůstává uložená.</p></div>`;
  $('side-panel').innerHTML=`<div class="section-title"><h2>Atlas světa</h2><span class="number">02 /</span></div><div class="atlas-search"><label><span class="field-label">Vyhledat zemi</span><input id="atlas-search" type="search" value="${esc(atlasQuery)}" placeholder="Například Česko, Japonsko…" autocomplete="off"></label></div><label class="settings-section"><span class="field-label">Oblast</span><select id="atlas-region">${regionOptions(atlasRegion)}</select></label><div id="atlas-list" class="atlas-list" aria-label="Seznam zemí"></div><div id="atlas-details" class="atlas-details"></div>`;
  $('atlas-search').oninput=e=>{atlasQuery=e.target.value;renderAtlasList();};$('atlas-region').onchange=e=>{atlasRegion=e.target.value;renderAtlasList();};renderAtlasList();selectAtlas(atlasCode);
}
function renderAtlasList(){const query=normalize(atlasQuery),matches=countries.filter(c=>(atlasRegion==='all'||c.region===atlasRegion)&&[c.name,c.code,c.iso3].some(s=>normalize(s).includes(query))).sort((a,b)=>a.name.localeCompare(b.name,'cs'));
  $('atlas-list').innerHTML=matches.length?matches.map(c=>`<button class="atlas-item ${c.code===atlasCode?'active':''}" data-country="${c.code}" aria-pressed="${c.code===atlasCode}"><span class="atlas-country-name">${flagImage(c.code)}${esc(c.name)}</span><span>${c.code} ↗</span></button>`).join(''):'<p class="empty">Žádná země neodpovídá hledání.</p>';
  document.querySelectorAll('[data-country]').forEach(b=>b.onclick=()=>selectAtlas(b.dataset.country));
}
function selectAtlas(code){atlasCode=code;const c=byCode[code];globe.focus(c);lastGlobeCode=code;$('globe').setAttribute('aria-label',`Glóbus – ${c.name}.`);
  $('world-caption').innerHTML=`<div class="country-caption">${flagImage(c.code)}<div><div class="caption-title">${esc(c.name)}</div><div class="caption-sub">${esc(Core.REGIONS[c.region])} / ${c.iso3}</div></div></div><div class="coord">${coords(c)}</div>`;
  const cap=c.code==='ID'?'Jakarta / budovaná Nusantara':c.capital.join(' / ');
  $('atlas-details').innerHTML=`<div class="atlas-flag-heading">${flagImage(c.code)}<h3>${esc(c.name)}</h3></div>${c.code==='AF'?'<p class="flag-caveat">Zobrazena je republikánská trikolóra z použité sady Noto, nikoli bílá vlajka de facto úřadů. Afghánistán proto není zařazen do vlajkových bonusů.</p>':''}<div class="fact-row"><span class="fact-label">HLAVNÍ MĚSTO</span><span class="fact-value">${esc(cap)}</span></div><div class="fact-row"><span class="fact-label">MĚNA</span><span class="fact-value">${c.currencyNames.map(m=>`${esc(m.name)} (${m.code})`).join('<br>')}</span></div><div class="fact-row"><span class="fact-label">JAZYKY · VÝBĚR</span><span class="fact-value">${esc(c.languageNames.join(', '))}</span></div><div class="fact-row"><span class="fact-label">OBYVATELSTVO</span><span class="fact-value">${c.population.toLocaleString('cs-CZ')}<small>Projekce ${c.populationYear} · OSN / Worldometer</small></span></div><div class="atlas-note">${esc(c.note||'Jazyky představují výběr hlavních nebo úředních jazyků. Počet obyvatel je populační projekce, nikoli průběžné sčítání.')}<br><button class="text-button" id="atlas-source">Zdroje a metodika</button></div>`;
  document.querySelectorAll('[data-country]').forEach(b=>{b.classList.toggle('active',b.dataset.country===code);b.setAttribute('aria-pressed',String(b.dataset.country===code));});$('atlas-source').onclick=showSources;
}
function openDialog(html){if(phase==='question')pauseQuestion();if(phase==='flying'){globe.pauseFlight(true);audio.setPaused(true);}$('dialog-content').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();$('dialog-close').focus();}
function showHelp(){openDialog(`<h2 id="dialog-title">Pět otázek za jeden pokus.</h2>
<div class="help-step"><span>01</span><div><strong>Pokus se platí při načtení nového státu.</strong><p>Začínáte s pěti pokusy. Načtení první země spotřebuje jeden, takže ukazatel poté zobrazuje čtyři rezervní pokusy. Stejně se platí každý další stát. Celou zaplacenou zemi vždy dohrajete: stát, hlavní město, měna, jazyk a obyvatelstvo. Chybná odpověď ani vypršení času pokus neodebírají. Vlajková otázka je zdarma.</p></div></div>
<div class="help-step"><span>02</span><div><strong>Každých 10 000 bodů dva pokusy a vlajka.</strong><p>Při dosažení nebo překročení 10 000, 20 000, 30 000 bodů atd. získáte <b>+2 pokusy okamžitě</b>. Současně se uloží nárok na jednu bonusovou otázku na vlajku. Bonus přijde až po všech pěti otázkách aktuálního státu, nikdy uprostřed. Správná vlajka přidá <b>další +1 pokus</b> a body za rychlost; chyba nebo vypršení bonusu nic neodebírá. Bonusové body se započítávají i do dalších hranic. Více čekajících bonusů se vyřídí postupně před změnou státu nebo hráče.</p></div></div>
<div class="help-step"><span>03</span><div><strong>Tři otočky před zemí i bonusem.</strong><p>Každý nový stát a každý vlajkový bonus předchází 12sekundový oddech: oddálení, nejméně tři otočky, zpomalení a u státu přiblížení. Před vlajkou se glóbus zastaví neutrálně, aby neprozradil odpověď. Mezi otázkami stejného státu se nečeká ani nerotuje. Klidový režim odstraní pohyb, nikoli oddech.</p></div></div>
<h3>Body a čas</h3><p><strong>Průzkumník: 30 s. Cestovatel: 20 s. Kartograf: 12 s.</strong> Správná odpověď dává 100 základních bodů a až 900 za rychlost, dohromady nejvýše 1 000. Body klesají po desítkách: 100 + 10 × zaokrouhlení(90 × zbývající čas / limit). V režimu Cestovatel je odpověď za přesně 5 sekund za 780 bodů. Stejné bodování platí i pro správnou vlajku, která navíc přidává jeden pokus. Chyba či vypršení limitu dává 0. Odpočet běží až po zobrazení otázky, nikdy během příletu.</p>
<h3>Kdy hra končí</h3><p>Nula rezervních pokusů neukončuje rozpracovaný stát. Dohrajete jej i všechny získané vlajky; bodová hranice nebo správná vlajka vás ještě může zachránit. Bez pokusu poté nelze načíst další stát. Počet států ani získaných pokusů nemá herní strop.</p>
<h3>Dva hráči</h3><p>Každý má vlastní body, pokusy i čekající bonusy. Tah se předává po dokončení země a jejích bonusů. Hráč bez rezervních pokusů vynechá další tahy; druhý pokračuje. Hra končí po vyčerpání pokusů obou, vítězí vyšší skóre.</p>
<h3>Měny bez nápovědy</h3><p>Možnosti uvádějí pouze obecné názvy jako koruna, dolar nebo frank, nikoli národní přívlastky a kódy. Stejné názvy se neduplikují a všechny místní platné měnové skupiny jsou vyloučeny z chybných možností. Úplné názvy a kódy se ukážou až ve vysvětlení odpovědi; v atlasu zůstávají úplné.</p>
<h3>Hudba</h3><p>Podkres při odpovídání má původní motiv a 20 nových melodií ve stejném tajemném soutěžním stylu. Melodie se losují bez opakování, dokud nezazní všech 21. Každá otázka začíná na jiném místě hudební fráze. Nové motivy mají 16 taktů; používají krátké basy, jemné arpeggio a příbuzné ladění se znělkami odpovědí. Tempo je 108 dob za minutu, v závěrečných pěti sekundách 120, bez návratu na začátek melodie. Pauza zachovává její pozici. Pod ≋ lze přehrávat další hudební ukázky.</p>
<h3>Ovládání, ukládání a trénink</h3><p>Odpovědi: myš, dotyk, 1–3 / A–C nebo šipky a Enter. P pozastaví otázku, M přepne zvuk. Další krok spouštíte tlačítkem po přečtení vysvětlení. Ukládání zachová i čekající bonusy a již zaplacený stát: při pokračování se pokus znovu neodečte. Nedokončený přílet se opakuje, jeho cena ne. Procvičování chyb je konečné, bez časového limitu a pokusů, za 100 bodů.</p>
<p>Vlajky jsou vložené offline; afghánská republikánská varianta je označená v atlasu a vyřazená z bonusů. Verze 6 kvůli novým pravidlům používá oddělené uložené hry a rekordy. Starší partie nepřevádí ani nepřepisuje. Číselná nastavení jsou pravidly remaku, nikoli doloženým přepisem originálu.</p>`);}
function showSources(){openDialog(`<h2 id="dialog-title">Data mají svůj příběh.</h2><p>Datová edice <strong>7. září 2026</strong>. Výběr tvoří 193 členů OSN, Palestina a Vatikán (Svatý stolec je pozorovatelským státem OSN). Nezahrnuje závislá území ani další částečně uznané státy.</p><h3>Obyvatelstvo: projekce, ne živé počítadlo</h3><p>Hra obsahuje hodnoty pro rok <strong>2026</strong> převzaté z tabulky Worldometer, která odkazuje na populační řadu OSN. Jde o projekce WPP 2024; nejde o dnešní přesné sčítání ani automaticky nejnovější národní statistiku. Metodika a územní vymezení se mohou od národních údajů lišit. Čísla v odpovědích zaokrouhlujeme. Databáze se sama nepřepisuje z internetu.</p><h3>Názvy, měny a jazyky</h3><p>Referenční údaje pocházejí z CountryInfo a Unicode CLDR, s ručními opravami současných měn a hlavních měst. Zvlášť ověřené změny zahrnují euro v Bulharsku a Ciudad de la Paz v Rovníkové Guineji. Jazyky jsou výběrem hlavních nebo úředních jazyků, nikoli úplným právním seznamem. Specificky formulované otázky rozlišují více hlavních měst, sídla vlády a nárokovaná města.</p><h3>Mapa a sporná území</h3><p>Natural Earth je generalizovaný orientační podklad. Hranice a barevné plochy nejsou právním stanoviskem a nemusí zachycovat všechny současné územní spory. U mikrostátů a ostrovů pomáhá značka polohy. Polohový bod není souřadnicí hlavního města.</p>${sources.map(s=>`<div class="source-item"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a><p>${esc(s.use)}</p></div>`).join('')}<h3>Vlajky a jejich varianty</h3><p>195 PNG ilustrací je přímo uvnitř hry (Noto Color Emoji 2.051). Jde o stylizované obrázky, ne technické výkresy poměrů stran a barev. Afghánská trikolóra je republikánská varianta, nikoli bílá vlajka de facto úřadů; není používána v bonusových otázkách. Velmi podobné vlajky se navzájem nepoužívají jako chybné možnosti.</p><h3>Soukromí a licence</h3><p>Hra funguje bez internetu, nepoužívá analytiku, reklamu ani vzdálené knihovny. Jména, výsledek a rozehraná hra se ukládají jen v místním prohlížeči. Odkazy na zdroje otevírají externí web až po kliknutí. Nový kód je poskytnut pod licencí MIT; zdrojová data mají vlastní podmínky uvedené v balíčku.</p><details class="license-details"><summary>Licence kódu a materiálů</summary><pre>${esc($('license-data').textContent)}</pre></details><button id="export-data" class="secondary full">Exportovat herní databázi do JSON</button>`);$('export-data').onclick=()=>{const blob=new Blob([JSON.stringify({edition:'2026-09-07',countries,sources},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='world-geography-data-2026.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};}
function showAudioSettings(){
  openDialog(`<h2 id="dialog-title">Hudba a zvuky.</h2><p>Nově vytvořený čipový doprovod. Při odpovídání se střídá 21 tajemných soutěžních melodií s pravidelným pulzem, krátkými basy a jemnou melodií. Každá otázka začíná na jiném místě; motiv se neopakuje, dokud neprojdou všechny. Správná i chybná odpověď používají stejnou zvukovou paletu; menu, přílet a bonus mají vlastní hudbu. Neobsahuje nahrávky ani melodie z originálu.</p><label class="audio-toggle"><span>Zapnout zvuk</span><input id="audio-enabled" type="checkbox" ${audio.enabled?'checked':''}></label><label class="audio-volume"><span>Hlasitost <b id="volume-label">${Math.round(audio.volume*100)} %</b></span><input id="audio-volume" type="range" min="0" max="100" value="${Math.round(audio.volume*100)}" aria-label="Hlasitost zvuku"></label><label class="audio-toggle"><span>Hudba v menu a během hry</span><input id="audio-music" type="checkbox" ${audio.music?'checked':''}></label><label class="audio-toggle"><span>Efekty a varování před koncem času</span><input id="audio-effects" type="checkbox" ${audio.effects?'checked':''}></label><p id="audio-theme-label" class="audio-disclaimer">21 motivů · náhodný začátek každé otázky</p><button id="audio-question-preview" class="secondary full">Ukázka hudby při odpovídání ♪</button><button id="audio-next-theme" class="secondary full">Další melodie →</button><button id="audio-preview" class="secondary full">Ukázka: správná odpověď</button><button id="audio-wrong-preview" class="secondary full">Ukázka: chybná odpověď</button><p class="audio-disclaimer">Nastavení se ukládá jen v tomto prohlížeči. Otázka zůstane pozastavená, dokud ji sami neobnovíte.</p>`);
  const apply=()=>{
    audio.configure({enabled:$('audio-enabled').checked,music:$('audio-music').checked,effects:$('audio-effects').checked,volume:Number($('audio-volume').value)/100});
    $('volume-label').textContent=Math.round(audio.volume*100)+' %';write(STORE.audio,audio.settings());if(audio.enabled)audio.unlock();
  };
  ['audio-enabled','audio-music','audio-effects','audio-volume'].forEach(id=>$(id).oninput=apply);
  $('audio-question-preview').onclick=()=>{
    if(audio.scene==='question'&&!audio.paused){audio.setScene('feedback');$('audio-question-preview').textContent='Ukázka hudby při odpovídání ♪';return;}
    audio.configure({enabled:true,music:true});$('audio-enabled').checked=true;$('audio-music').checked=true;write(STORE.audio,audio.settings());
    audio.unlock().then(ok=>{if(ok&&$('dialog').open&&$('audio-question-preview')){audio.setPaused(false);audio.stopVoices('effects');audio.beginQuestion(`preview:${++musicPreviewSerial}`);audio.setScene('question');$('audio-question-preview').textContent='Zastavit hudební ukázku';updateThemeLabel();}});
  };
  function updateThemeLabel(){const m=audio.status().melody;$('audio-theme-label').textContent=`${m.index+1} / ${m.count} · ${m.name} · začátek od ${Math.floor(m.startStep/8)+1}. taktu`;}
  $('audio-next-theme').onclick=()=>{audio.setScene('feedback');$('audio-question-preview').click();};
  const previewAnswer=kind=>{
    audio.configure({enabled:true,effects:true});$('audio-enabled').checked=true;$('audio-effects').checked=true;write(STORE.audio,audio.settings());
    audio.unlock().then(ok=>{if(ok&&$('dialog').open&&$('audio-question-preview')){
      audio.setPaused(false);audio.setScene('feedback');audio.cue(kind);
      $('audio-question-preview').textContent='Ukázka hudby při odpovídání ♪';
    }});
  };
  $('audio-preview').onclick=()=>previewAnswer('correct');
  $('audio-wrong-preview').onclick=()=>previewAnswer('wrong');
}
$('nav-play').onclick=()=>{audio.unlock();if(game&&!game.completed)renderGame();else renderHome();window.scrollTo({top:0,behavior:'auto'});};
$('brand').onclick=()=>{if(view==='home')captureSettings();renderHome();window.scrollTo({top:0,behavior:'auto'});};
$('nav-atlas').onclick=()=>{if(view==='home')captureSettings();renderAtlas();window.scrollTo({top:0,behavior:'auto'});};
$('nav-help').onclick=showHelp;$('data-button').onclick=showSources;$('dialog-close').onclick=()=>$('dialog').close();$('sound-options').onclick=showAudioSettings;
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}});
$('dialog').addEventListener('close',()=>{if(phase==='flying'){globe.pauseFlight(document.hidden);audio.setScene('flight');audio.setPaused(document.hidden);}else if(phase==='paused')audio.setPaused(true);else{audio.setScene(view==='results'?'results':view==='game'?'feedback':'home');audio.setPaused(document.hidden);}});
$('sound').onclick=()=>{
  if(audio.enabled&&!audio.unlocked){audio.unlock();return;}
  audio.configure({enabled:!audio.enabled});write(STORE.audio,audio.settings());if(audio.enabled)audio.unlock();
};
$('zoom-in').onclick=()=>globe.setZoom(globe.targetZoom+.25);$('zoom-out').onclick=()=>globe.setZoom(globe.targetZoom-.25);$('globe-reset').onclick=()=>globe.reset();
document.addEventListener('keydown',e=>{
  if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||$('dialog').open)return;
  const k=e.key.toLowerCase();if(k==='m'){e.preventDefault();$('sound').click();return;}
  if(view!=='game'||!game)return;
  if(k==='p'){e.preventDefault();if(phase==='paused')resumeQuestion();else pauseQuestion();return;}
  if(phase==='flying'||phase==='paused')return;
  const answer=game.answers[game.index];
  if(!answer){const idx={'1':0,'2':1,'3':2,a:0,b:1,c:2}[k];if(idx!==undefined){e.preventDefault();choose(idx);return;}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();selected=(selected+(['ArrowUp','ArrowLeft'].includes(e.key)?2:1))%3;document.querySelectorAll('[data-answer]').forEach(b=>b.classList.toggle('key-selected',Number(b.dataset.answer)===selected));document.querySelector(`[data-answer="${selected}"]`)?.focus({preventScroll:true});audio.cue('select');}
    if(e.key==='Enter'&&e.target.tagName!=='BUTTON'){e.preventDefault();choose(selected);}
  }else if(e.key==='Enter'&&e.target.tagName!=='BUTTON'){e.preventDefault();nextQuestion();}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(phase==='question')pauseQuestion();globe.pauseFlight(true);audio.setPaused(true);saveGame();}
  else if(phase==='flying'&&!$('dialog').open){globe.pauseFlight(false);audio.setPaused(false);}
  else if(phase!=='paused')audio.setPaused(false);
});
window.addEventListener('pagehide',()=>{if(clock?.running){stopClock();phase='paused';}saveGame();audio.setPaused(true);});
window.WorldGeography=Object.freeze({
  getState:()=>game?JSON.parse(JSON.stringify(game)):null,getView:()=>view,
  getStatus:()=>({phase,clock:clock?{elapsedMs:clock.elapsed(),remainingMs:clock.remaining(),running:clock.running,index:clockIndex}:null,globe:{latitude:globe.lat*180/Math.PI,longitude:globe.lon*180/Math.PI,zoom:globe.zoom,locked:globe.locked,flight:globe.flightState()},audio:audio.status()}),
  version:'7.0.0',edition:'2026-09-07'
});
renderHome();renderSound();
})();
