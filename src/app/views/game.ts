/**
 * The game screen: the world header, the question panel, the per-question clock
 * and the four transitions between two answers.
 *
 * It is one module rather than four because the clock is not separable from the
 * render that shows it. `renderGame` decides the phase, `ensureClock` builds the
 * clock the phase implies, `startClockAfterPaint` refuses to start it until the
 * question is actually on screen, and `tickClock` writes back into the markup
 * `renderGame` just produced. Splitting those apart would only move the coupling
 * into an import cycle.
 *
 * Four variables are genuinely local and stay here: `clockRAF` is one animation
 * frame handle, `lastPersist` throttles the once-a-second save, `lastTickSecond`
 * debounces the countdown cue so it fires once per second rather than once per
 * frame, and `startingClock` is the re-entrancy guard on the paint wait. Nothing
 * outside this file has ever read any of them.
 *
 * `saveGame`, `stopClock` and `snapshotClock` are exported because leaving the
 * screen has to do all three — the clock is the one piece of a run that is live
 * rather than stored, so anything that navigates away has to fold it back into
 * the save before it goes.
 */
import * as Core from '../../engine/core.ts';
import { GeoClock } from '../../engine/clock.ts';
import type { AnswerResult, Country, Question, QuestionType, Region } from '../../engine/types.ts';
import { requireAudio, requireGlobe, store } from '../state.ts';
import { STORE } from '../storage.ts';
import { byCode, countries } from '../database.ts';
import {
  $, attemptWord, coords, dialog, esc, flagImage, lifePips, optional, persist, pointText, seconds,
} from '../dom.ts';
import { renderMobileHud } from '../mobile-hud.ts';
import { renderView, setView } from '../main.ts';
import { beginFlight } from './flight.ts';
import { renderResults } from './results.ts';

let clockRAF = 0;
let lastPersist = 0;
let lastTickSecond: number | null = null;
let startingClock = false;

/** Fold the live clock back into the run, but only while it still describes it. */
export function snapshotClock(): void {
  const game=store.game,clock=store.clock;
  if(game&&clock&&store.clockIndex===game.index)game.clock={index:game.index,elapsedMs:clock.elapsed(),paused:store.phase==='paused'||(!clock.running&&game.clock?.paused===true)};
}

export function stopClock(): void {
  cancelAnimationFrame(clockRAF);clockRAF=0;startingClock=false;if(store.clock)store.clock.pause();
}

export function saveGame(): void {
  snapshotClock();persist(STORE.run,store.game&&!store.game.completed?store.game:null);
}

export function scrollQuestion(newVisit: boolean): void {
  if(store.phase==='flying')return;if(innerWidth<701){setTimeout(()=>{(newVisit?$('world-heading'):$('side-panel')).scrollIntoView({block:'start',behavior:'auto'});},20);}else if(newVisit)window.scrollTo({top:0,behavior:'auto'});
}

/** The globe caption and the score chips: everything above the question panel. */
export function renderWorldHeader(q: Question, c: Country, answer: AnswerResult | undefined, flying = false): void {
  const game=store.game!;
  const bonus=q.type==='flag',paused=store.phase==='paused',isHidden=(q.type==='country'&&!answer)||(bonus&&!answer)||flying||paused;
  document.body.classList.toggle('flag-question',bonus&&!flying&&!paused);
  $('globe').setAttribute('aria-label',flying?'Glóbus se třikrát otáčí. Probíhá oddech před zemí nebo vlajkovým bonusem.':bonus&&!answer?'Neutrální glóbus. Poloha země vlajkového bonusu je skrytá.':isHidden?'Na glóbu je zvýrazněna hledaná země. Její polohu označuje bod.':`Glóbus – ${c.name}. Její polohu označuje bod.`);
  $('world-heading').innerHTML=`<div class="game-heading"><div><div class="eyebrow accent">${game.review?'TRÉNINK / OPAKOVÁNÍ CHYB':'HRA NA POKUSY / '+esc(Core.REGIONS[game.options.region as Region]||'CELÝ SVĚT')}</div><h1>${game.review?'Ještě jednou.':bonus?'Vlajkový <em>bonus.</em>':`Zastávka <span>${String(q.visit+1).padStart(2,'0')}</span>`}</h1></div><div class="round-note">${game.review?`${game.index+1} / ${game.questions.length}`:'BEZ LIMITU KOL'}</div></div>
  <div class="score-chips">${game.scores.map((score,i)=>`<div class="score-chip ${q.player===i?'active':''} ${!game.review&&game.lives[i]===0&&i!==q.player?'eliminated':''}"><div class="score-top"><span class="player-name">${esc(game.options.names[i]||`Hráč ${i+1}`)}</span><b>${pointText(score)}</b></div>${game.review?'':`<div class="score-lives">${lifePips(game.lives[i]!)}<span data-player-lives="${i}">${game.lives[i]===0?(i===q.player&&!game.gameOver?(q.type==='flag'?'0 · BONUS O ZÁCHRANU':'0 · STÁT JE ZAPLACEN'):'BEZ DALŠÍHO POKUSU'):`${game.lives[i]} ${attemptWord(game.lives[i]!)}`}</span></div>`}</div>`).join('')}</div>`;
  const name=flying?'Chvíle na oddech.':paused?'Pauza':bonus&&!answer?'Poznáte vlajku?':isHidden?'Neznámá země':c.name;
  const sub=flying?'3 OTOČKY → ZAMĚŘENÍ → PŘIBLÍŽENÍ':paused?'ODPOČET JE POZASTAVEN':bonus&&!answer?'SPRÁVNĚ = BODY A +1 POKUS':c.code==='AF'?'REPUBLIKÁNSKÁ VLAJKA · VIZ ATLAS':isHidden&&game.options.difficulty==='expert'?'KARTOGRAF / POLOHA NA GLÓBU':Core.REGIONS[c.region];
  $('world-caption').innerHTML=`<div class="country-caption">${!flying&&!paused&&!bonus?flagImage(c.code,isHidden):''}<div><div class="caption-title">${esc(name)}</div><div class="caption-sub">${esc(sub)}</div></div></div><div class="coord">${flying||paused||bonus?'':isHidden&&game.options.difficulty==='expert'?'POLOHA NA GLÓBU':coords(c)}</div>`;
}

/** The strip above every question panel, and above the flight card too. */
export function questionHeader(q: Question): string {
  const game=store.game!;
  const bonus=q.type==='flag',step=Core.TYPES.indexOf(q.type as QuestionType),lives=game.review?null:game.lives[q.player]!;
  const threshold=game.review?0:Core.nextBonusThreshold(game,q.player),remaining=threshold-game.scores[q.player]!;
  const pending=game.review?0:game.pendingBonuses[q.player]!.length;
  const bonusProgress=bonus?'SPRÁVNĚ = BODY A +1':pending?`VLAJKA ČEKÁ PO STÁTU${pending>1?' ×'+pending:''}`:`K +2 A VLAJCE: ${pointText(Math.max(0,remaining))} B.`;
  const caption=game.review?`OPAKOVÁNÍ ${game.index+1} / ${game.questions.length}`:bonus?`BONUS ZA ${pointText(q.bonusThreshold!)} BODŮ`:`OTÁZKA ${String(game.index+1).padStart(2,'0')}`;
  return `<div class="question-head"><span>${caption}</span><strong>Na tahu: ${esc(game.options.names[q.player]||`Hráč ${q.player+1}`)}</strong></div><div class="steps" aria-label="${bonus?'Samostatný vlajkový bonus':`${step+1}. okruh z pěti`}">${(bonus?['flag']:Core.TYPES).map((_,i)=>`<span class="step ${bonus?'current bonus-step':i<step?'done':i===step?'current':''}"></span>`).join('')}</div>${game.review?'':`<div class="question-lives"><span>${lifePips(lives!)} <b>${lives}</b> ${attemptWord(lives!)}</span><span id="bonus-progress" data-next-bonus="${threshold}" title="Za ${pointText(threshold)} bodů +2 pokusy a vlajka po dokončení země">${bonusProgress}</span></div>`}`;
}

/** The countdown and the reward readout, in every phase the game has. */
export function timerPanel(answer: AnswerResult | null | undefined = null): string {
  const game=store.game!;
  const limit=Core.timeLimit(game),elapsed=answer?.elapsedMs??store.clock?.elapsed()??0,remaining=limit?Math.max(0,limit-elapsed):0;
  const pts=answer?answer.points:Core.pointsForTime(elapsed,limit),pending=store.phase==='flying',paused=store.phase==='paused';
  return `<div class="timing-panel ${answer?'finished':''}" id="timing-panel"><div class="time-readout"><span class="instrument-label">${!limit?'TRÉNINK':pending?'ODPOČET ČEKÁ':paused?'POZASTAVENO':answer?'ZBÝVALO':'ČAS NA ODPOVĚĎ'}</span><strong><span data-time-readout>${limit?seconds(remaining):'∞'}</span><small>${limit?'s':''}</small></strong></div><div class="reward-readout"><span class="instrument-label">${answer?'ZÍSKÁNO':'TEĎ HRAJETE O'}</span><strong><span data-points-readout>${pointText(pts)}</span><small>bodů</small></strong></div>${store.phase==='question'?'<button id="pause-game" class="pause-button" aria-label="Pozastavit otázku" title="Pauza (P)">Ⅱ</button>':''}<div class="time-track" id="time-track" role="progressbar" aria-label="Zbývající čas" aria-valuemin="0" aria-valuemax="${limit/1000||1}" aria-valuenow="${limit?Math.ceil(remaining/1000):1}"><span id="time-fill" style="transform:scaleX(${limit?remaining/limit:1})"></span></div><div class="timing-note">${!limit?'Opakování bez limitu · 100 bodů za správnou odpověď':pending?'Čas začne až po přiblížení a zobrazení otázky.':answer?'Výsledek této odpovědi je uložen.':paused?'Čas ani body během pauzy neubývají.':'100 bodů základ + až 900 bodů za rychlost'}</div></div>`;
}

export function footer(): string {
  const game=store.game!;
  return `<div class="game-footer"><span class="coord">${store.phase==='flying'?'ODDECH PŘED ZEMÍ / BONUSEM':store.phase==='paused'?'PAUZA':store.phase==='feedback'?'ODPOVĚĎ VYHODNOCENA':game.review?'TRÉNINK BEZ LIMITU':'RYCHLOST ROZHODUJE'}</span><button id="back-home" class="text-button">Uložit a odejít</button></div>`;
}

export function bindExit(): void {
  $('back-home').onclick=()=>{renderView('home');window.scrollTo({top:0,behavior:'auto'});};
}

/** The clock the current question implies, resumed from the save if there is one. */
function ensureClock(): void {
  const game=store.game!;
  if(store.clock&&store.clockIndex===game.index)return;
  stopClock();const saved=game.clock?.index===game.index?game.clock:null;
  store.clock=new GeoClock(Core.timeLimit(game),saved?.elapsedMs||0);store.clockIndex=game.index;
  game.clock={index:game.index,elapsedMs:store.clock.elapsed(),paused:saved?.paused===true};lastTickSecond=null;
}

export function renderGame(): void {
  if(!store.game||store.game.completed){if(store.game?.completed)renderResults();else renderView('home');return;}
  setView('game');const game=store.game,q=game.questions[game.index]!,c=byCode[q.country]!,answer=game.answers[game.index],bonus=q.type==='flag',step=Core.TYPES.indexOf(q.type as QuestionType);
  if(!answer&&game.revealedIndex!==game.index){
    if(Core.needsFlight(game)){beginFlight(q,c);return;}
    game.revealedIndex=game.index;store.phase='question';
    requireAudio().setRegion(byCode[q.anchor||q.country]!.region);
    if(bonus)requireAudio().cue('bonus');
  }
  if(bonus&&!answer){if(store.lastGlobeCode!=='__bonus__'){requireGlobe().present(null);store.lastGlobeCode='__bonus__';}}
  else if(store.lastGlobeCode!==c.code){requireGlobe().present(c);store.lastGlobeCode=c.code;}
  if(answer){stopClock();store.phase='feedback';}else{ensureClock();store.phase=game.clock!.paused?'paused':'question';}
  document.body.classList.remove('flying');document.body.classList.toggle('question-paused',store.phase==='paused');$('flight-status').hidden=true;
  renderWorldHeader(q,c,answer);
  if(store.phase==='paused'){
    $('side-panel').innerHTML=questionHeader(q)+timerPanel()+`<div class="paused-card"><span class="pause-emblem" aria-hidden="true">Ⅱ</span><h2>Expedice počká.</h2><p>Otázka i vlajka jsou schované. Čas, pokusy a dostupné body zůstávají beze změny.</p><button id="resume-clock" class="primary"><span>Pokračovat v otázce</span><span aria-hidden="true">→</span></button><p class="pause-shortcut">Klávesa P také obnoví hru.</p></div>`+footer();
    $('resume-clock').onclick=resumeQuestion;bindExit();$('mobile-hud').hidden=true;requireAudio().setPaused(true);return;
  }
  const end=game.gameOver||(game.review&&game.index===game.questions.length-1);
  const lifeParts: string[]=[];
  if(answer&&!game.review){
    if(answer.scoreLifeDelta)lifeParts.push(`Bodová hranice ${answer.milestoneThresholds.map(pointText).join(' / ')}: +${answer.scoreLifeDelta} ${attemptWord(answer.scoreLifeDelta)}. ${bonus?'Další vlajkový bonus je připraven.':'Vlajka čeká po dokončení země.'}`);
    if(answer.flagLifeDelta)lifeParts.push('Správná vlajka: +1 další pokus.');
    if(!answer.correct)lifeParts.push(bonus?'Bonus nevyšel. Pokus se neodebírá.':'Pokus se za chybu ani vypršení času neodebírá.');
    lifeParts.push(`Na další země zbývá ${answer.livesAfter} ${attemptWord(answer.livesAfter)}.${answer.livesAfter===0&&!game.gameOver&&!bonus&&Core.TYPES.indexOf(q.type as QuestionType)<4?' Tuto zemi ještě dohrajete.':''}`);
  }
  const lifeMessage=lifeParts.join(' ');
  const turn=game.review?null:Core.nextTurn(game);
  const nextLabel=end?'Výsledky hry':game.review?'Další otázka':turn&&turn.kind==='bonus'?`Vlajkový bonus · 12 s oddechu`:turn&&turn.kind==='country'?(turn.player!==q.player?'Předat tah · 12 s oddechu':'Další země · 12 s oddechu'):bonus?'Pokračovat v této zemi':'Další otázka';
  $('side-panel').innerHTML=questionHeader(q)+timerPanel(answer)+`<div class="question-category"><span class="category-number">${bonus?'+1':step+1}</span>${Core.LABELS[q.type]}</div><h2 id="question-title" class="question-title" tabindex="-1">${esc(q.prompt)}</h2>
  ${bonus?`<div class="bonus-flag-card">${flagImage(c.code,!answer,'bonus-flag')}<div class="bonus-reward">${game.review?'PROCVIČOVÁNÍ VLAJEK':'BODY A +1 POKUS ZA SPRÁVNOU ODPOVĚĎ'}</div></div>`:''}
  <div class="answer-list" role="group" aria-labelledby="question-title">${q.options.map((text,i)=>{const cls=answer?(i===q.correct?'correct':i===answer.selected?'wrong':'dim'):(store.selected===i?'key-selected':'');return `<button class="answer ${cls}" data-answer="${i}" ${answer?'disabled':''}><span class="answer-letter" aria-hidden="true">${['A','B','C'][i]}</span><span class="answer-text">${esc(text)}</span><span class="answer-mark" aria-hidden="true">${answer?(i===q.correct?'✓':i===answer.selected?'×':''):''}</span></button>`;}).join('')}</div>
  ${answer?`<div class="feedback" aria-live="polite"><div class="feedback-title ${answer.correct?'':'incorrect'}">${answer.timedOut?'Čas vypršel. +0 bodů':answer.correct?`Správně. +${pointText(answer.points)} bodů`:'Tentokrát ne. +0 bodů'}</div>${lifeMessage?`<div class="life-feedback ${answer.lifeDelta>0?'life-earned':answer.lifeDelta<0?'life-lost':''}">${esc(lifeMessage)}${game.gameOver?' Všem hráčům došly pokusy.':''}</div>`:''}<div class="answer-timing">${answer.timedOut?'Bez odpovědi v limitu':`Odpověď za ${seconds(answer.elapsedMs)} s`}${answer.correct?` · ${answer.basePoints} základ + ${pointText(answer.bonusPoints||0)} časový bonus`:''}</div><p>${esc(q.explanation)}</p>${q.source==='worldometer-un-2026'?'<a href="https://www.worldometers.info/world-population/population-by-country/" target="_blank" rel="noopener noreferrer">Populační zdroj: Worldometer / OSN ↗</a>':''}<button id="next" class="primary"><span>${nextLabel}</span><span class="arrow" aria-hidden="true">→</span></button></div>`:`<p class="question-tip">Zvolte jednu odpověď. <span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span> / <span class="kbd">A</span> <span class="kbd">B</span> <span class="kbd">C</span> · <span class="kbd">P</span> pauza</p>`}`+footer();
  document.querySelectorAll<HTMLElement>('[data-answer]').forEach(b=>{b.onclick=()=>choose(Number(b.dataset['answer']));});
  if(optional('next'))$('next').onclick=nextQuestion;if(optional('pause-game'))$('pause-game').onclick=pauseQuestion;bindExit();
  if(!answer&&!bonus)requireAudio().beginQuestion(`${game.created}:${game.index}`);
  requireAudio().setPaused(document.hidden||dialog().open);requireAudio().setScene(answer?'feedback':bonus?'bonus':'question');
  renderMobileHud(answer);if(!answer)startClockAfterPaint();
}

/**
 * Start the countdown only once the question is really on screen.
 *
 * The flag images are decoded first and two frames are allowed to pass, because
 * a player cannot answer a question the browser has not painted yet — starting
 * on the render call would charge them for the paint.
 */
function startClockAfterPaint(): void {
  if(store.clock!.running){if(!clockRAF)tickClock();return;}if(startingClock)return;
  startingClock=true;const expected=store.clock;
  const images=[...$('main-view').querySelectorAll<HTMLImageElement>('img.country-flag')];
  Promise.all(images.map(img=>{
    // `decode` is unavailable in older browsers, which then simply do not wait.
    const decode=(img as {decode?:()=>Promise<void>}).decode;
    return decode?decode.call(img).catch(()=>{}):Promise.resolve();
  })).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(store.clock!==expected||store.phase!=='question'||store.view!=='game'){startingClock=false;return;}
    startingClock=false;if(document.hidden||dialog().open){pauseQuestion();return;}
    store.clock!.start();store.game!.clock!.paused=false;lastPersist=performance.now();tickClock();saveGame();
  })));
}

function tickClock(): void {
  clockRAF=0;if(store.phase!=='question'||store.view!=='game'||!store.clock)return;
  const game=store.game!;
  const limit=Core.timeLimit(game),elapsed=store.clock.elapsed(),remaining=limit?Math.max(0,limit-elapsed):Infinity;
  if(limit&&remaining<=0){choose(null);return;}
  document.querySelectorAll('[data-time-readout]').forEach(e=>{e.textContent=limit?seconds(remaining):'∞';});
  document.querySelectorAll('[data-points-readout]').forEach(e=>{e.textContent=pointText(Core.pointsForTime(elapsed,limit));});
  if(optional('time-fill'))$('time-fill').style.transform=`scaleX(${limit?remaining/limit:1})`;
  if(optional('time-track'))$('time-track').setAttribute('aria-valuenow',String(limit?Math.ceil(remaining/1000):1));
  const urgent=limit>0&&remaining<=5000;optional('timing-panel')?.classList.toggle('urgent',urgent);$('mobile-hud').classList.toggle('urgent',urgent);
  if(urgent){if(game.questions[game.index]!.type!=='flag')requireAudio().setScene('urgent');const sec=Math.ceil(remaining/1000);if(sec!==lastTickSecond){requireAudio().cue('tick');lastTickSecond=sec;}}
  if(performance.now()-lastPersist>=1000){saveGame();lastPersist=performance.now();}
  clockRAF=requestAnimationFrame(tickClock);
}

export function pauseQuestion(): void {
  const game=store.game;
  if(store.phase!=='question'||!game||game.answers[game.index])return;
  if(store.clock&&Core.timeLimit(game)&&store.clock.remaining()<=0){choose(null);return;}
  stopClock();store.phase='paused';snapshotClock();game.clock!.paused=true;saveGame();renderGame();
}

export function resumeQuestion(): void {
  const game=store.game;
  if(store.phase!=='paused'||!game)return;requireAudio().unlock();game.clock!.paused=false;store.phase='question';requireAudio().setPaused(false);renderGame();
}

export function choose(index: number | null): void {
  const game=store.game;
  if(store.view!=='game'||!game||store.phase!=='question'||!store.clock||(!store.clock.running&&store.clock.remaining()>0)||dialog().open||document.hidden)return;
  const result=Core.submit(game,index,store.clock.elapsed());if(!result)return;
  stopClock();store.phase='feedback';requireAudio().setScene('feedback');requireAudio().cue(result.lifeDelta>0?'extraLife':result.timedOut?'timeout':result.correct?'correct':'wrong');saveGame();renderGame();
  optional('next')?.focus({preventScroll:true});if(innerWidth<701)setTimeout(()=>{optional('next')?.scrollIntoView({block:'nearest',behavior:'auto'});},50);
}

export function nextQuestion(): void {
  const game=store.game;
  if(!game||!game.answers[game.index])return;store.selected=0;stopClock();store.clock=null;store.clockIndex=-1;store.phase='idle';
  if(Core.advance(game,countries)){saveGame();renderGame();scrollQuestion(false);}else{saveGame();renderResults();requireAudio().cue('complete');window.scrollTo({top:0,behavior:'auto'});}
}
