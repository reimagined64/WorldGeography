(function(){
'use strict';
const $=id=>document.getElementById(id),Core=window.GeoCore,App=window.GeoApp,S=App.store,storage=App.storage;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const countries=JSON.parse($('country-data').textContent),map=JSON.parse($('map-data').textContent),sources=JSON.parse($('source-data').textContent),flags=JSON.parse($('flag-data').textContent);
try{Core.validateCountries(countries);}catch(e){$('side-panel').textContent='Databáze se nepodařila načíst: '+e.message;return;}
const byCode=Object.fromEntries(countries.map(c=>[c.code,c]));
const STORE=storage.STORE,write=storage.write,defaults=storage.DEFAULT_SETTINGS;
S.options=storage.loadSettings();
S.record=storage.loadRecord();
let clockRAF=0,lastPersist=0,lastTickSecond=null,startingClock=false,toastTimer,storageWarningShown=false;
S.audio=new GeoAudio(storage.loadAudioSettings());
S.game=storage.loadRun(countries,byCode);
S.globe=new GeoGlobe($('globe'),map);S.globe.setMotion(S.options.motion==='full');
const attemptWord=n=>n===1?'pokus':n>=2&&n<=4?'pokusy':'pokusů';
function flagImage(code,hiddenName=false,extra=''){return `<img class="country-flag ${extra}" src="${flags[code]}" alt="${hiddenName?'Vlajka k poznání':'Vlajka: '+esc(byCode[code].name)}" draggable="false" decoding="sync">`;}
function lifePips(n){return `<span class="life-pips" aria-hidden="true">${Array.from({length:5},(_,i)=>`<i class="${i<n?'filled':''}"></i>`).join('')}${n>5?`<small>+${n-5}</small>`:''}</span>`;}
function persist(key,value){const ok=write(key,value);if(!ok&&!storageWarningShown){storageWarningShown=true;notify('Prohlížeč nepovoluje ukládání. Po zavření stránky se postup ztratí.');}return ok;}
function saveGame(){snapshotClock();persist(STORE.run,S.game&&!S.game.completed?S.game:null);}
function notify(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function snapshotClock(){
  if(S.game&&S.clock&&S.clockIndex===S.game.index)S.game.clock={index:S.game.index,elapsedMs:S.clock.elapsed(),paused:S.phase==='paused'||(!S.clock.running&&S.game.clock?.paused===true)};
}
function stopClock(){cancelAnimationFrame(clockRAF);clockRAF=0;startingClock=false;if(S.clock)S.clock.pause();}
function renderSound(){
  const pending=S.audio.enabled&&!S.audio.unlocked,active=S.audio.enabled&&S.audio.unlocked&&!S.audio.paused;
  $('sound').innerHTML=`<span aria-hidden="true">${S.audio.enabled?'♪':'♩'}</span><span class="sound-label">${S.audio.enabled?'ZVUK':'TICHO'}</span>`;
  $('sound').classList.toggle('sound-on',active);$('sound').setAttribute('aria-pressed',String(S.audio.enabled));
  $('sound').setAttribute('aria-label',pending?'Spustit zvuk':S.audio.enabled?'Vypnout zvuk':'Zapnout zvuk');
  $('sound').title=(pending?'Spustit zvuk':S.audio.enabled?'Vypnout zvuk':'Zapnout zvuk')+' (M)';
  if($('home-sound'))$('home-sound').textContent=S.audio.failed?'Zvuk není dostupný v tomto prohlížeči.':!S.audio.enabled?'Zvuk vypnutý · klávesou M jej zapnete.':pending?'♫ Hudba a zvuky se spustí se hrou.':'♫ Zvuk zapnutý · klávesou M jej ztišíte.';
}
S.audio.onChange=renderSound;
function leaveGame(){
  if(S.view!=='game')return;
  if(S.phase==='question'){stopClock();S.phase='paused';snapshotClock();}
  if(S.phase==='flying'){S.globe.cancelFlight();S.revealToken++;S.flightKey=null;}
  saveGame();S.phase='idle';$('flight-status').hidden=true;$('mobile-hud').hidden=true;
  document.body.classList.remove('flying','question-paused','flag-question');
  document.querySelectorAll('.globe-controls button').forEach(b=>b.disabled=false);
}
function setView(next){
  if(next!=='game')leaveGame();S.view=next;
  document.body.classList.toggle('game-active',next==='game');document.body.classList.toggle('atlas-active',next==='atlas');
  $('main-view').hidden=next==='results';$('results-view').hidden=next!=='results';$('nav-atlas').classList.toggle('active',next==='atlas');$('nav-play').classList.toggle('active',next!=='atlas');
  if(next!=='game'){S.audio.setPaused(document.hidden);S.audio.setScene(next==='results'?'results':'home');}
}
function coords(c){return `${Math.abs(c.lat).toFixed(1)}° ${c.lat>=0?'N':'S'} / ${Math.abs(c.lon).toFixed(1)}° ${c.lon>=0?'E':'W'}`;}
function captureSettings(){['p1-name','p2-name'].forEach((id,i)=>{if($(id))S.options.names[i]=($(id).value.trim()||defaults.names[i]).slice(0,24);});if($('difficulty'))S.options.difficulty=$('difficulty').value;if($('region'))S.options.region=$('region').value;if($('motion-mode'))S.options.motion=$('motion-mode').value;persist(STORE.settings,S.options);}
function regionOptions(value){return `<option value="all"${value==='all'?' selected':''}>Celý svět</option>`+Object.entries(Core.REGIONS).map(([key,label])=>`<option value="${key}"${value===key?' selected':''}>${label}</option>`).join('');}
function renderHome(){
  setView('home');S.lastGlobeCode=null;S.globe.home();S.globe.setMotion(S.options.motion==='full');$('globe').setAttribute('aria-label','Otočný glóbus světa. Táhněte pro otočení, použijte plus a minus pro přiblížení.');
  $('world-heading').innerHTML=`<div class="eyebrow accent">ARCADE EDITION / VERZE 7.0</div><h1>Tři otočky.<br><em>A další šance.</em></h1><p class="intro-line">Zeměpisná klasika inspirovaná Commodorem 64.<br>Hrajte, dokud vám zbývá alespoň jeden pokus.</p>`;
  $('world-caption').innerHTML=`<div class="globe-stats"><div><strong>195</strong><span>zemí a vlajek</span></div><div><strong>5</strong><span>počátečních pokusů</span></div><div><strong>∞</strong><span>otázek ve hře</span></div></div><div class="coord">1985 → 2026<br>VLAJKOVÝ BONUS</div>`;
  $('side-panel').innerHTML=`<div class="section-title"><h2>Vaše příští expedice</h2><span class="number">01 /</span></div><p class="panel-intro">Pět pokusů. Žádný pevný počet kol.</p>
  <div class="settings-section"><span class="field-label" id="players-label">Počet hráčů</span><div class="segmented" role="group" aria-labelledby="players-label"><button data-players="1" aria-pressed="${S.options.players===1}">Jeden hráč</button><button data-players="2" aria-pressed="${S.options.players===2}">Dva hráči</button></div>
  <div class="players-fields"><label><span class="field-label">${S.options.players===2?'První hráč':'Vaše jméno'}</span><input id="p1-name" type="text" maxlength="24" value="${esc(S.options.names[0])}" autocomplete="off"></label>${S.options.players===2?`<label><span class="field-label">Druhý hráč</span><input id="p2-name" type="text" maxlength="24" value="${esc(S.options.names[1])}" autocomplete="off"></label>`:''}</div></div>
  <div class="setting-row"><label><span class="field-label">Obtížnost</span><select id="difficulty"><option value="easy"${S.options.difficulty==='easy'?' selected':''}>Průzkumník</option><option value="normal"${S.options.difficulty==='normal'?' selected':''}>Cestovatel</option><option value="expert"${S.options.difficulty==='expert'?' selected':''}>Kartograf</option></select></label><label><span class="field-label">Oblast</span><select id="region">${regionOptions(S.options.region)}</select></label></div>
  <div class="survival-rule"><div class="survival-rule-top"><span>NA STARTU</span>${lifePips(5)}<strong>5 pokusů</strong></div><p>Nový stát: <b>−1 pokus za všech 5 otázek.</b><br>Každých 10 000 bodů: <b>+2 pokusy hned</b> a po dokončení státu vlajkový bonus o <b>body a další +1 pokus.</b> Chyby pokusy neodebírají.</p></div>
  <label class="motion-setting"><span class="field-label">Oddech před zemí i bonusem · 12 sekund</span><select id="motion-mode"><option value="full"${S.options.motion==='full'?' selected':''}>Plné otáčení · 3 celé otočky a přiblížení</option><option value="reduced"${S.options.motion==='reduced'?' selected':''}>Klidový režim · stejný oddech, bez pohybu</option></select></label>
  <p class="length-note" id="length-note"></p><div class="category-row">${[...Core.TYPES,'flag'].map((type,i)=>`<span class="category-chip ${type==='flag'?'bonus-chip':''}">${type==='flag'?'+':String(i+1).padStart(2,'0')} ${Core.LABELS[type]}</span>`).join('')}</div>
  <button id="start" class="primary"><span>Zahájit expedici</span><span class="arrow" aria-hidden="true">→</span></button>
  ${S.game&&!S.game.completed?`<button id="resume" class="secondary full">Pokračovat · otázka ${S.game.index+1}${S.game.review?' · trénink':` · ${S.game.lives.join(' / ')} pokusů`}</button>`:''}
  <p class="sound-note" id="home-sound"></p><div class="setup-bottom"><span id="setup-time"></span><span>${S.record?`REKORD <strong>${Number(S.record.points||0).toLocaleString('cs-CZ')} BODŮ</strong>`:'<strong>AŽ 1 000 BODŮ</strong> ZA ODPOVĚĎ'}</span></div>`;
  document.querySelectorAll('[data-players]').forEach(b=>b.onclick=()=>{captureSettings();S.options.players=Number(b.dataset.players);persist(STORE.settings,S.options);renderHome();});
  ['difficulty','region','motion-mode'].forEach(id=>$(id).onchange=()=>{captureSettings();S.globe.setMotion(S.options.motion==='full');updateLengthNote();});
  ['p1-name','p2-name'].forEach(id=>{if($(id))$(id).onchange=captureSettings;});
  $('start').onclick=()=>{captureSettings();if(S.game&&!S.game.completed)confirmNew();else startGame();};
  if($('resume'))$('resume').onclick=()=>{S.audio.unlock();S.lastGlobeCode=null;renderGame();};
  updateLengthNote();renderSound();
}
function updateLengthNote(){
  $('length-note').textContent=`Výběr z ${Core.getPool(countries,S.options).length} zemí · 100 bodů základ + až 900 za rychlost.`;
  $('setup-time').textContent=`LIMIT ${Core.TIME_LIMITS[S.options.difficulty]/1000} s / OTÁZKA`;
}
function startGame(){S.audio.unlock();stopClock();S.clock=null;S.clockIndex=-1;S.revealToken++;S.flightKey=null;S.phase='idle';try{S.game=Core.makeGame(countries,{...S.options,names:[...S.options.names]});S.lastGlobeCode=null;S.selected=0;saveGame();renderGame();scrollQuestion(true);}catch(e){notify(e.message);}}
function confirmNew(){openDialog(`<h2 id="dialog-title">Zahájit novou expedici?</h2><p>Dosavadní rozehraná hra se nahradí. Uložený nejlepší výsledek zůstane zachovaný.</p><div class="dialog-controls"><button class="secondary" id="cancel-new">Zpět</button><button class="primary" id="confirm-new">Nová expedice →</button></div>`);$('cancel-new').onclick=()=>$('dialog').close();$('confirm-new').onclick=()=>{$('dialog').close();startGame();};}
const seconds=ms=>(Math.ceil(Math.max(0,ms)/100)/10).toLocaleString('cs-CZ',{minimumFractionDigits:1,maximumFractionDigits:1});
const pointText=n=>n.toLocaleString('cs-CZ');
function renderWorldHeader(q,c,answer,flying=false){
  const bonus=q.type==='flag',paused=S.phase==='paused',isHidden=(q.type==='country'&&!answer)||(bonus&&!answer)||flying||paused;
  document.body.classList.toggle('flag-question',bonus&&!flying&&!paused);
  $('globe').setAttribute('aria-label',flying?'Glóbus se třikrát otáčí. Probíhá oddech před zemí nebo vlajkovým bonusem.':bonus&&!answer?'Neutrální glóbus. Poloha země vlajkového bonusu je skrytá.':isHidden?'Na glóbu je zvýrazněna hledaná země. Její polohu označuje bod.':`Glóbus – ${c.name}. Její polohu označuje bod.`);
  $('world-heading').innerHTML=`<div class="game-heading"><div><div class="eyebrow accent">${S.game.review?'TRÉNINK / OPAKOVÁNÍ CHYB':'HRA NA POKUSY / '+esc(Core.REGIONS[S.game.options.region]||'CELÝ SVĚT')}</div><h1>${S.game.review?'Ještě jednou.':bonus?'Vlajkový <em>bonus.</em>':`Zastávka <span>${String(q.visit+1).padStart(2,'0')}</span>`}</h1></div><div class="round-note">${S.game.review?`${S.game.index+1} / ${S.game.questions.length}`:'BEZ LIMITU KOL'}</div></div>
  <div class="score-chips">${S.game.scores.map((score,i)=>`<div class="score-chip ${q.player===i?'active':''} ${!S.game.review&&S.game.lives[i]===0&&i!==q.player?'eliminated':''}"><div class="score-top"><span class="player-name">${esc(S.game.options.names[i]||`Hráč ${i+1}`)}</span><b>${pointText(score)}</b></div>${S.game.review?'':`<div class="score-lives">${lifePips(S.game.lives[i])}<span data-player-lives="${i}">${S.game.lives[i]===0?(i===q.player&&!S.game.gameOver?(q.type==='flag'?'0 · BONUS O ZÁCHRANU':'0 · STÁT JE ZAPLACEN'):'BEZ DALŠÍHO POKUSU'):`${S.game.lives[i]} ${attemptWord(S.game.lives[i])}`}</span></div>`}</div>`).join('')}</div>`;
  const name=flying?'Chvíle na oddech.':paused?'Pauza':bonus&&!answer?'Poznáte vlajku?':isHidden?'Neznámá země':c.name;
  const sub=flying?'3 OTOČKY → ZAMĚŘENÍ → PŘIBLÍŽENÍ':paused?'ODPOČET JE POZASTAVEN':bonus&&!answer?'SPRÁVNĚ = BODY A +1 POKUS':c.code==='AF'?'REPUBLIKÁNSKÁ VLAJKA · VIZ ATLAS':isHidden&&S.game.options.difficulty==='expert'?'KARTOGRAF / POLOHA NA GLÓBU':Core.REGIONS[c.region];
  $('world-caption').innerHTML=`<div class="country-caption">${!flying&&!paused&&!bonus?flagImage(c.code,isHidden):''}<div><div class="caption-title">${esc(name)}</div><div class="caption-sub">${esc(sub)}</div></div></div><div class="coord">${flying||paused||bonus?'':isHidden&&S.game.options.difficulty==='expert'?'POLOHA NA GLÓBU':coords(c)}</div>`;
}
function questionHeader(q){
  const bonus=q.type==='flag',step=Core.TYPES.indexOf(q.type),lives=S.game.review?null:S.game.lives[q.player];
  const threshold=S.game.review?0:Core.nextBonusThreshold(S.game,q.player),remaining=threshold-S.game.scores[q.player];
  const pending=S.game.review?0:S.game.pendingBonuses[q.player].length;
  const bonusProgress=bonus?'SPRÁVNĚ = BODY A +1':pending?`VLAJKA ČEKÁ PO STÁTU${pending>1?' ×'+pending:''}`:`K +2 A VLAJCE: ${pointText(Math.max(0,remaining))} B.`;
  const caption=S.game.review?`OPAKOVÁNÍ ${S.game.index+1} / ${S.game.questions.length}`:bonus?`BONUS ZA ${pointText(q.bonusThreshold)} BODŮ`:`OTÁZKA ${String(S.game.index+1).padStart(2,'0')}`;
  return `<div class="question-head"><span>${caption}</span><strong>Na tahu: ${esc(S.game.options.names[q.player]||`Hráč ${q.player+1}`)}</strong></div><div class="steps" aria-label="${bonus?'Samostatný vlajkový bonus':`${step+1}. okruh z pěti`}">${(bonus?['flag']:Core.TYPES).map((_,i)=>`<span class="step ${bonus?'current bonus-step':i<step?'done':i===step?'current':''}"></span>`).join('')}</div>${S.game.review?'':`<div class="question-lives"><span>${lifePips(lives)} <b>${lives}</b> ${attemptWord(lives)}</span><span id="bonus-progress" data-next-bonus="${threshold}" title="Za ${pointText(threshold)} bodů +2 pokusy a vlajka po dokončení země">${bonusProgress}</span></div>`}`;
}
function timerPanel(answer=null){
  const limit=Core.timeLimit(S.game),elapsed=answer?.elapsedMs??S.clock?.elapsed()??0,remaining=limit?Math.max(0,limit-elapsed):0;
  const pts=answer?answer.points:Core.pointsForTime(elapsed,limit),pending=S.phase==='flying',paused=S.phase==='paused';
  return `<div class="timing-panel ${answer?'finished':''}" id="timing-panel"><div class="time-readout"><span class="instrument-label">${!limit?'TRÉNINK':pending?'ODPOČET ČEKÁ':paused?'POZASTAVENO':answer?'ZBÝVALO':'ČAS NA ODPOVĚĎ'}</span><strong><span data-time-readout>${limit?seconds(remaining):'∞'}</span><small>${limit?'s':''}</small></strong></div><div class="reward-readout"><span class="instrument-label">${answer?'ZÍSKÁNO':'TEĎ HRAJETE O'}</span><strong><span data-points-readout>${pointText(pts)}</span><small>bodů</small></strong></div>${S.phase==='question'?'<button id="pause-game" class="pause-button" aria-label="Pozastavit otázku" title="Pauza (P)">Ⅱ</button>':''}<div class="time-track" id="time-track" role="progressbar" aria-label="Zbývající čas" aria-valuemin="0" aria-valuemax="${limit/1000||1}" aria-valuenow="${limit?Math.ceil(remaining/1000):1}"><span id="time-fill" style="transform:scaleX(${limit?remaining/limit:1})"></span></div><div class="timing-note">${!limit?'Opakování bez limitu · 100 bodů za správnou odpověď':pending?'Čas začne až po přiblížení a zobrazení otázky.':answer?'Výsledek této odpovědi je uložen.':paused?'Čas ani body během pauzy neubývají.':'100 bodů základ + až 900 bodů za rychlost'}</div></div>`;
}
function footer(){return `<div class="game-footer"><span class="coord">${S.phase==='flying'?'ODDECH PŘED ZEMÍ / BONUSEM':S.phase==='paused'?'PAUZA':S.phase==='feedback'?'ODPOVĚĎ VYHODNOCENA':S.game.review?'TRÉNINK BEZ LIMITU':'RYCHLOST ROZHODUJE'}</span><button id="back-home" class="text-button">Uložit a odejít</button></div>`;}
function bindExit(){$('back-home').onclick=()=>{renderHome();window.scrollTo({top:0,behavior:'auto'});};}
function beginFlight(q,c){
  const key=`${S.game.created}:${S.game.index}`;if(S.phase==='flying'&&S.flightKey===key&&S.globe.flight)return;
  stopClock();S.clock=null;S.clockIndex=-1;S.game.clock=null;S.phase='flying';S.flightKey=key;const token=++S.revealToken,bonus=q.type==='flag';
  S.globe.setMotion(S.options.motion==='full');
  document.body.classList.add('flying');document.body.classList.remove('question-paused','flag-question');$('mobile-hud').hidden=true;
  document.querySelectorAll('.globe-controls button').forEach(b=>b.disabled=true);
  renderWorldHeader(q,c,null,true);
  $('side-panel').innerHTML=questionHeader(q)+`<div class="flight-card"><div class="eyebrow accent">${bonus?'ODDECH PŘED VLAJKOVÝM BONUSEM':'ODDECH PŘED DALŠÍ ZEMÍ'}</div><div class="rest-countdown"><strong id="rest-seconds">12,0</strong><span>sekund</span></div><h2 id="flight-title">Svět počká.</h2><p id="flight-description">${bonus?'Tři celé otočky zeměkoule. Potom poznávání vlajky.':'Tři celé otočky zeměkoule. Pak zaměření a přiblížení.'}</p><div class="rest-track" role="progressbar" aria-label="Průběh oddechu" aria-valuemin="0" aria-valuemax="12" aria-valuenow="0" id="rest-track"><span id="rest-fill"></span></div><div class="flight-steps"><span data-flight-step="spin">01 / TŘI OTOČKY</span><span data-flight-step="settle">02 / ZAMĚŘENÍ</span><span data-flight-step="zoom">03 / ${bonus?'BONUS':'PŘIBLÍŽENÍ'}</span></div><div class="rest-detail" id="rest-detail">Odpočet otázky ještě neběží.</div><p class="flight-footnote">${bonus?'Bonus nestojí žádný pokus.':'Nový stát: −1 pokus již zaplacen za všech pět otázek.'}<br>Čas otázky během oddechu neběží.</p><button class="text-button motion-flight" id="flight-motion">${S.options.motion==='full'?'Omezit pohyb':'Zapnout plné otáčení'}</button></div>`+footer();bindExit();
  $('flight-motion').onclick=()=>{S.options.motion=S.options.motion==='full'?'reduced':'full';persist(STORE.settings,S.options);S.globe.setMotion(S.options.motion==='full');$('flight-motion').textContent=S.options.motion==='full'?'Omezit pohyb':'Zapnout plné otáčení';};
  $('flight-status').hidden=false;$('flight-status').textContent='ODDECH · 12 s';
  S.audio.setRegion(c.region);S.audio.setScene('flight');S.audio.setPaused(document.hidden||$('dialog').open);S.audio.cue('flight');
  S.globe.reveal(c,{neutral:bonus,onStage:stage=>{
    if(token!==S.revealToken||S.view!=='game')return;
    const text={depart:['Chvíle na oddech.','Oddalujeme glóbus před dalším putováním.'],spin:['Svět se točí.','Tři celé otočky. Žádný spěch, odpočet otázky čeká.'],settle:[bonus?'Zastavujeme glóbus.':'Zaměřujeme cíl.',bonus?'Poloha země zůstává utajená.':'Otáčení zpomaluje a glóbus se zastaví.'],zoom:[bonus?'Přichází vlajkový bonus.':'Přibližujeme zemi.',bonus?'Poznáte vlajku? Správná odpověď přidá body i pokus.':'Připravte se. Odpočet začne až po příletu.']}[stage];
    if($('flight-title'))$('flight-title').textContent=text[0];if($('flight-description'))$('flight-description').textContent=text[1];
    document.querySelectorAll('[data-flight-step]').forEach(e=>e.classList.toggle('active',e.dataset.flightStep===(stage==='depart'?'spin':stage)));
    if(stage==='zoom')S.audio.cue(bonus?'bonus':'zoom');
  },onProgress:state=>{
    if(token!==S.revealToken||!$('rest-seconds'))return;
    $('rest-seconds').textContent=seconds(state.remainingMs);$('rest-fill').style.transform=`scaleX(${state.progress})`;
    $('rest-track').setAttribute('aria-valuenow',String(Math.floor(state.elapsed/1000)));
    const label=!state.motion?'KLIDOVÝ REŽIM':state.stage==='spin'?`OTOČKA ${Math.min(3,state.turnsCompleted+1)} / 3`:state.stage==='settle'?'ZAMĚŘENÍ':state.stage==='zoom'?(bonus?'VLAJKOVÝ BONUS':'PŘIBLÍŽENÍ'):'ODLET';
    $('flight-status').textContent=`${label} · ODDECH ${Math.ceil(state.remainingMs/1000)} s`;
    $('rest-detail').textContent=state.motion?`Dokončené otočky: ${state.turnsCompleted} / 3 · odpočet otázky čeká`:'Bez pohybu · délka oddechu zůstává 12 sekund';
  },onComplete:()=>{
    if(token!==S.revealToken||S.view!=='game'||S.game.questions[S.game.index]!==q)return;
    S.game.revealedIndex=S.game.index;S.lastGlobeCode=bonus?'__bonus__':c.code;S.flightKey=null;S.phase='question';$('flight-status').hidden=true;document.body.classList.remove('flying');
    document.querySelectorAll('.globe-controls button').forEach(b=>b.disabled=false);
    S.audio.cue(bonus?'bonus':'arrival');renderGame();
    if(innerWidth<701)$('side-panel').scrollIntoView({block:'start',behavior:'auto'});
    saveGame();
  }});
  if(document.hidden||$('dialog').open)S.globe.pauseFlight(true);
  if(innerWidth<701)requestAnimationFrame(()=>document.querySelector('.canvas-wrap').scrollIntoView({block:'start',behavior:'auto'}));
  else window.scrollTo({top:0,behavior:'auto'});
  saveGame();
}
function ensureClock(){
  if(S.clock&&S.clockIndex===S.game.index)return;
  stopClock();const saved=S.game.clock?.index===S.game.index?S.game.clock:null;
  S.clock=new GeoClock(Core.timeLimit(S.game),saved?.elapsedMs||0);S.clockIndex=S.game.index;
  S.game.clock={index:S.game.index,elapsedMs:S.clock.elapsed(),paused:saved?.paused===true};lastTickSecond=null;
}
function renderGame(){
  if(!S.game||S.game.completed){if(S.game?.completed)renderResults();else renderHome();return;}
  setView('game');const q=S.game.questions[S.game.index],c=byCode[q.country],answer=S.game.answers[S.game.index],bonus=q.type==='flag',step=Core.TYPES.indexOf(q.type);
  if(!answer&&S.game.revealedIndex!==S.game.index){
    if(Core.needsFlight(S.game)){beginFlight(q,c);return;}
    S.game.revealedIndex=S.game.index;S.phase='question';
    S.audio.setRegion(byCode[q.anchor||q.country].region);
    if(bonus)S.audio.cue('bonus');
  }
  if(bonus&&!answer){if(S.lastGlobeCode!=='__bonus__'){S.globe.present(null);S.lastGlobeCode='__bonus__';}}
  else if(S.lastGlobeCode!==c.code){S.globe.present(c);S.lastGlobeCode=c.code;}
  if(answer){stopClock();S.phase='feedback';}else{ensureClock();S.phase=S.game.clock.paused?'paused':'question';}
  document.body.classList.remove('flying');document.body.classList.toggle('question-paused',S.phase==='paused');$('flight-status').hidden=true;
  renderWorldHeader(q,c,answer);
  if(S.phase==='paused'){
    $('side-panel').innerHTML=questionHeader(q)+timerPanel()+`<div class="paused-card"><span class="pause-emblem" aria-hidden="true">Ⅱ</span><h2>Expedice počká.</h2><p>Otázka i vlajka jsou schované. Čas, pokusy a dostupné body zůstávají beze změny.</p><button id="resume-clock" class="primary"><span>Pokračovat v otázce</span><span aria-hidden="true">→</span></button><p class="pause-shortcut">Klávesa P také obnoví hru.</p></div>`+footer();
    $('resume-clock').onclick=resumeQuestion;bindExit();$('mobile-hud').hidden=true;S.audio.setPaused(true);return;
  }
  const end=S.game.gameOver||(S.game.review&&S.game.index===S.game.questions.length-1);
  const lifeParts=[];
  if(answer&&!S.game.review){
    if(answer.scoreLifeDelta)lifeParts.push(`Bodová hranice ${answer.milestoneThresholds.map(pointText).join(' / ')}: +${answer.scoreLifeDelta} ${attemptWord(answer.scoreLifeDelta)}. ${bonus?'Další vlajkový bonus je připraven.':'Vlajka čeká po dokončení země.'}`);
    if(answer.flagLifeDelta)lifeParts.push('Správná vlajka: +1 další pokus.');
    if(!answer.correct)lifeParts.push(bonus?'Bonus nevyšel. Pokus se neodebírá.':'Pokus se za chybu ani vypršení času neodebírá.');
    lifeParts.push(`Na další země zbývá ${answer.livesAfter} ${attemptWord(answer.livesAfter)}.${answer.livesAfter===0&&!S.game.gameOver&&!bonus&&Core.TYPES.indexOf(q.type)<4?' Tuto zemi ještě dohrajete.':''}`);
  }
  const lifeMessage=lifeParts.join(' ');
  const next=S.game.review?null:Core.nextTurn(S.game);
  const nextLabel=end?'Výsledky hry':S.game.review?'Další otázka':next.kind==='bonus'?`Vlajkový bonus · 12 s oddechu`:next.kind==='country'?(next.player!==q.player?'Předat tah · 12 s oddechu':'Další země · 12 s oddechu'):bonus?'Pokračovat v této zemi':'Další otázka';
  $('side-panel').innerHTML=questionHeader(q)+timerPanel(answer)+`<div class="question-category"><span class="category-number">${bonus?'+1':step+1}</span>${Core.LABELS[q.type]}</div><h2 id="question-title" class="question-title" tabindex="-1">${esc(q.prompt)}</h2>
  ${bonus?`<div class="bonus-flag-card">${flagImage(c.code,!answer,'bonus-flag')}<div class="bonus-reward">${S.game.review?'PROCVIČOVÁNÍ VLAJEK':'BODY A +1 POKUS ZA SPRÁVNOU ODPOVĚĎ'}</div></div>`:''}
  <div class="answer-list" role="group" aria-labelledby="question-title">${q.options.map((text,i)=>{const cls=answer?(i===q.correct?'correct':i===answer.selected?'wrong':'dim'):(S.selected===i?'key-selected':'');return `<button class="answer ${cls}" data-answer="${i}" ${answer?'disabled':''}><span class="answer-letter" aria-hidden="true">${['A','B','C'][i]}</span><span class="answer-text">${esc(text)}</span><span class="answer-mark" aria-hidden="true">${answer?(i===q.correct?'✓':i===answer.selected?'×':''):''}</span></button>`;}).join('')}</div>
  ${answer?`<div class="feedback" aria-live="polite"><div class="feedback-title ${answer.correct?'':'incorrect'}">${answer.timedOut?'Čas vypršel. +0 bodů':answer.correct?`Správně. +${pointText(answer.points)} bodů`:'Tentokrát ne. +0 bodů'}</div>${lifeMessage?`<div class="life-feedback ${answer.lifeDelta>0?'life-earned':answer.lifeDelta<0?'life-lost':''}">${esc(lifeMessage)}${S.game.gameOver?' Všem hráčům došly pokusy.':''}</div>`:''}<div class="answer-timing">${answer.timedOut?'Bez odpovědi v limitu':`Odpověď za ${seconds(answer.elapsedMs)} s`}${answer.correct?` · ${answer.basePoints} základ + ${pointText(answer.bonusPoints||0)} časový bonus`:''}</div><p>${esc(q.explanation)}</p>${q.source==='worldometer-un-2026'?'<a href="https://www.worldometers.info/world-population/population-by-country/" target="_blank" rel="noopener noreferrer">Populační zdroj: Worldometer / OSN ↗</a>':''}<button id="next" class="primary"><span>${nextLabel}</span><span class="arrow" aria-hidden="true">→</span></button></div>`:`<p class="question-tip">Zvolte jednu odpověď. <span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span> / <span class="kbd">A</span> <span class="kbd">B</span> <span class="kbd">C</span> · <span class="kbd">P</span> pauza</p>`}`+footer();
  document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>choose(Number(b.dataset.answer)));
  if($('next'))$('next').onclick=nextQuestion;if($('pause-game'))$('pause-game').onclick=pauseQuestion;bindExit();
  if(!answer&&!bonus)S.audio.beginQuestion(`${S.game.created}:${S.game.index}`);
  S.audio.setPaused(document.hidden||$('dialog').open);S.audio.setScene(answer?'feedback':bonus?'bonus':'question');
  App.renderMobileHud(hudHost,answer);if(!answer)startClockAfterPaint();
}
const hudHost={$,seconds,pointText,onPause:()=>pauseQuestion()};
function startClockAfterPaint(){
  if(S.clock.running){if(!clockRAF)tickClock();return;}if(startingClock)return;
  startingClock=true;const expected=S.clock;
  const images=[...$('main-view').querySelectorAll('img.country-flag')];
  Promise.all(images.map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve())).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(S.clock!==expected||S.phase!=='question'||S.view!=='game'){startingClock=false;return;}
    startingClock=false;if(document.hidden||$('dialog').open){pauseQuestion();return;}
    S.clock.start();S.game.clock.paused=false;lastPersist=performance.now();tickClock();saveGame();
  })));
}
function tickClock(){
  clockRAF=0;if(S.phase!=='question'||S.view!=='game'||!S.clock)return;
  const limit=Core.timeLimit(S.game),elapsed=S.clock.elapsed(),remaining=limit?Math.max(0,limit-elapsed):Infinity;
  if(limit&&remaining<=0){choose(null);return;}
  document.querySelectorAll('[data-time-readout]').forEach(e=>e.textContent=limit?seconds(remaining):'∞');
  document.querySelectorAll('[data-points-readout]').forEach(e=>e.textContent=pointText(Core.pointsForTime(elapsed,limit)));
  if($('time-fill'))$('time-fill').style.transform=`scaleX(${limit?remaining/limit:1})`;
  if($('time-track'))$('time-track').setAttribute('aria-valuenow',String(limit?Math.ceil(remaining/1000):1));
  const urgent=limit>0&&remaining<=5000;$('timing-panel')?.classList.toggle('urgent',urgent);$('mobile-hud').classList.toggle('urgent',urgent);
  if(urgent){if(S.game.questions[S.game.index].type!=='flag')S.audio.setScene('urgent');const sec=Math.ceil(remaining/1000);if(sec!==lastTickSecond){S.audio.cue('tick');lastTickSecond=sec;}}
  if(performance.now()-lastPersist>=1000){saveGame();lastPersist=performance.now();}
  clockRAF=requestAnimationFrame(tickClock);
}
function pauseQuestion(){
  if(S.phase!=='question'||!S.game||S.game.answers[S.game.index])return;
  if(S.clock&&Core.timeLimit(S.game)&&S.clock.remaining()<=0){choose(null);return;}
  stopClock();S.phase='paused';snapshotClock();S.game.clock.paused=true;saveGame();renderGame();
}
function resumeQuestion(){
  if(S.phase!=='paused'||!S.game)return;S.audio.unlock();S.game.clock.paused=false;S.phase='question';S.audio.setPaused(false);renderGame();
}
function choose(index){
  if(S.view!=='game'||!S.game||S.phase!=='question'||!S.clock||(!S.clock.running&&S.clock.remaining()>0)||$('dialog').open||document.hidden)return;
  const result=Core.submit(S.game,index,S.clock.elapsed());if(!result)return;
  stopClock();S.phase='feedback';S.audio.setScene('feedback');S.audio.cue(result.lifeDelta>0?'extraLife':result.timedOut?'timeout':result.correct?'correct':'wrong');saveGame();renderGame();
  $('next')?.focus({preventScroll:true});if(innerWidth<701)setTimeout(()=>{$('next')?.scrollIntoView({block:'nearest',behavior:'auto'});},50);
}
function nextQuestion(){
  if(!S.game||!S.game.answers[S.game.index])return;S.selected=0;stopClock();S.clock=null;S.clockIndex=-1;S.phase='idle';
  if(Core.advance(S.game,countries)){saveGame();renderGame();scrollQuestion(false);}else{saveGame();renderResults();S.audio.cue('complete');window.scrollTo({top:0,behavior:'auto'});}
}
function scrollQuestion(newVisit){if(S.phase==='flying')return;if(innerWidth<701){setTimeout(()=>{(newVisit?$('world-heading'):$('side-panel')).scrollIntoView({block:'start',behavior:'auto'});},20);}else if(newVisit)window.scrollTo({top:0,behavior:'auto'});}
function renderResults(){
  if(!S.game)return;setView('results');
  const timed=S.game.answers.filter(a=>Number.isFinite(a?.elapsedMs)&&!a.timedOut),average=timed.length?timed.reduce((sum,a)=>sum+a.elapsedMs,0)/timed.length:null,bonus=S.game.answers.reduce((sum,a)=>sum+(a?.bonusPoints||0),0),timeouts=S.game.answers.filter(a=>a?.timedOut).length;
  const correct=S.game.answers.filter(a=>a?.correct).length,total=S.game.answers.length,accuracy=total?Math.round(correct/total*100):0,points=S.game.scores.reduce((a,b)=>a+b,0),wrong=S.game.questions.map((q,i)=>({q,a:S.game.answers[i],i})).filter(x=>x.a&&!x.a.correct),bestScore=Math.max(...S.game.scores);
  if(!S.game.review&&(!S.record||bestScore>(S.record.points||0))){S.record={points:bestScore,total,date:new Date().toISOString()};persist(STORE.record,S.record);}
  let title=S.game.review?'Znalosti doplněny.':'Pokusy došly. Svět zůstává.';
  let sub=`${correct} správných odpovědí z ${total}. ${S.game.review?'Trénink neovlivňuje rekordy ani pokusy.':'Začněte novou výpravu nebo procvičte chyby.'}`;
  if(S.game.options.players===2){title=S.game.scores[0]===S.game.scores[1]?'Bodová remíza.':`Vítězí ${S.game.options.names[S.game.scores[0]>S.game.scores[1]?0:1]}.`;sub='Oběma hráčům došly pokusy. O vítězi rozhoduje celkový počet bodů.';}
  $('results-view').innerHTML=`<div class="result-wrap"><div class="result-top"><div class="stamp" aria-hidden="true">◎</div><div class="eyebrow accent">${S.game.review?'OPAKOVÁNÍ DOKONČENO':'KONEC HRY / VYČERPANÉ POKUSY'}</div><h1>${esc(title)}</h1><p>${esc(sub)}</p>${S.game.options.players===2?`<div class="duel-result">${S.game.scores.map((s,i)=>`<span>${esc(S.game.options.names[i])} <strong>${pointText(s)}</strong> bodů<br>${S.game.answers.filter(a=>a.player===i).length} odpovědí · +${S.game.earnedLives[i]} pokusů z bodů a vlajek</span>`).join('')}</div>`:''}</div>
  <div class="result-stats"><div class="result-stat"><strong>${pointText(points)}</strong><span>CELKEM BODŮ</span></div><div class="result-stat"><strong>${accuracy} %</strong><span>ÚSPĚŠNOST</span></div><div class="result-stat"><strong>${S.game.review?(average===null?'—':seconds(average)+' s'):'+'+S.game.earnedLives.reduce((a,b)=>a+b,0)}</strong><span>${S.game.review?'PRŮMĚRNÝ ČAS':'POKUSŮ Z BODŮ A VLAJEK'}</span></div></div>
  <div class="result-timing-summary">${new Set(S.game.questions.filter(q=>q.type!=='flag').map(q=>q.country)).size} navštívených zemí · <strong>${pointText(bonus)} bodů za rychlost</strong> · ${timeouts}× vypršel čas · průměr ${average===null?'—':seconds(average)+' s'}</div>
  <div class="result-columns"><div><h2>Jak se vám dařilo</h2>${[...Core.TYPES,'flag'].map(type=>{const qs=S.game.questions.map((q,i)=>({q,i})).filter(x=>x.q.type===type&&S.game.answers[x.i]),num=qs.filter(x=>S.game.answers[x.i].correct).length;return `<div class="category-result"><div class="bar-label"><span>${Core.LABELS[type]}</span><span>${num} / ${qs.length}</span></div><div class="bar"><span style="width:${qs.length?num/qs.length*100:0}%"></span></div></div>`;}).join('')}</div><div><h2>${wrong.length?'Co stojí za zopakování':'Bez jediné chyby'}</h2><div class="mistake-list">${wrong.map(({q,a})=>`<div class="mistake"><div class="mistake-country">${flagImage(q.country)}<strong>${esc(byCode[q.country].name)} · ${Core.LABELS[q.type]}</strong></div><small>${esc(q.prompt)}</small><span class="mistake-answer">✓ ${esc(q.options[q.correct])}</span><small>Vaše odpověď: ${a.timedOut?'Vypršel čas':esc(q.options[a.selected]??'—')}</small></div>`).join('')}</div></div></div>
  <div class="result-actions"><button id="again" class="primary"><span>Nová expedice</span><span class="arrow">→</span></button>${wrong.length?'<button id="review" class="secondary">Procvičit chyby · 1 hráč</button>':''}<button id="results-atlas" class="secondary">Prozkoumat atlas</button></div></div>`;
  $('again').onclick=()=>{renderHome();window.scrollTo({top:0,behavior:'auto'});};$('results-atlas').onclick=()=>{renderAtlas();window.scrollTo({top:0,behavior:'auto'});};
  if($('review'))$('review').onclick=()=>{
    const questions=wrong.map(({q},i)=>({...Core.makeQuestion(byCode[q.country],q.type,countries,S.game.options.difficulty),visit:i,player:0}));
    stopClock();S.clock=null;S.clockIndex=-1;S.phase='idle';S.game={version:7,revealedIndex:null,clock:null,review:true,options:{...S.game.options,players:1,names:['Trénink']},questions,index:0,answers:[],scores:[0],created:new Date().toISOString(),completed:false};S.lastGlobeCode=null;S.selected=0;saveGame();renderGame();scrollQuestion(true);
  };
}
const atlas=App.createAtlas({$,countries,byCode,esc,flagImage,coords,regionOptions,setView,showSources:()=>showSources()});
function renderAtlas(){atlas.render();}
function openDialog(html){if(S.phase==='question')pauseQuestion();if(S.phase==='flying'){S.globe.pauseFlight(true);S.audio.setPaused(true);}$('dialog-content').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();$('dialog-close').focus();}
function showHelp(){App.showHelp(openDialog);}
function showSources(){App.showSources({$,openDialog,esc,sources,countries,licenseText:$('license-data').textContent});}
function showAudioSettings(){App.showAudioSettings({$,openDialog,persist});}
$('nav-play').onclick=()=>{S.audio.unlock();if(S.game&&!S.game.completed)renderGame();else renderHome();window.scrollTo({top:0,behavior:'auto'});};
$('brand').onclick=()=>{if(S.view==='home')captureSettings();renderHome();window.scrollTo({top:0,behavior:'auto'});};
$('nav-atlas').onclick=()=>{if(S.view==='home')captureSettings();renderAtlas();window.scrollTo({top:0,behavior:'auto'});};
$('nav-help').onclick=showHelp;$('data-button').onclick=showSources;$('dialog-close').onclick=()=>$('dialog').close();$('sound-options').onclick=showAudioSettings;
$('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('dialog').close();}});
$('dialog').addEventListener('close',()=>{if(S.phase==='flying'){S.globe.pauseFlight(document.hidden);S.audio.setScene('flight');S.audio.setPaused(document.hidden);}else if(S.phase==='paused')S.audio.setPaused(true);else{S.audio.setScene(S.view==='results'?'results':S.view==='game'?'feedback':'home');S.audio.setPaused(document.hidden);}});
$('sound').onclick=()=>{
  if(S.audio.enabled&&!S.audio.unlocked){S.audio.unlock();return;}
  S.audio.configure({enabled:!S.audio.enabled});persist(STORE.audio,S.audio.settings());if(S.audio.enabled)S.audio.unlock();
};
$('zoom-in').onclick=()=>S.globe.setZoom(S.globe.targetZoom+.25);$('zoom-out').onclick=()=>S.globe.setZoom(S.globe.targetZoom-.25);$('globe-reset').onclick=()=>S.globe.reset();
document.addEventListener('keydown',e=>{
  if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||$('dialog').open)return;
  const k=e.key.toLowerCase();if(k==='m'){e.preventDefault();$('sound').click();return;}
  if(S.view!=='game'||!S.game)return;
  if(k==='p'){e.preventDefault();if(S.phase==='paused')resumeQuestion();else pauseQuestion();return;}
  if(S.phase==='flying'||S.phase==='paused')return;
  const answer=S.game.answers[S.game.index];
  if(!answer){const idx={'1':0,'2':1,'3':2,a:0,b:1,c:2}[k];if(idx!==undefined){e.preventDefault();choose(idx);return;}
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();S.selected=(S.selected+(['ArrowUp','ArrowLeft'].includes(e.key)?2:1))%3;document.querySelectorAll('[data-answer]').forEach(b=>b.classList.toggle('key-selected',Number(b.dataset.answer)===S.selected));document.querySelector(`[data-answer="${S.selected}"]`)?.focus({preventScroll:true});S.audio.cue('select');}
    if(e.key==='Enter'&&e.target.tagName!=='BUTTON'){e.preventDefault();choose(S.selected);}
  }else if(e.key==='Enter'&&e.target.tagName!=='BUTTON'){e.preventDefault();nextQuestion();}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){if(S.phase==='question')pauseQuestion();S.globe.pauseFlight(true);S.audio.setPaused(true);saveGame();}
  else if(S.phase==='flying'&&!$('dialog').open){S.globe.pauseFlight(false);S.audio.setPaused(false);}
  else if(S.phase!=='paused')S.audio.setPaused(false);
});
window.addEventListener('pagehide',()=>{if(S.clock?.running){stopClock();S.phase='paused';}saveGame();S.audio.setPaused(true);});
App.installDebugApi(window);
renderHome();renderSound();
})();
