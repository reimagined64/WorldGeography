/**
 * The twelve-second arrival: three turns of the globe, then the question.
 *
 * This is the only asynchronous screen in the game — the globe drives it frame
 * by frame and hands back four callbacks that outlive the render that created
 * them — and that is what `revealToken` is for. Every callback below opens by
 * comparing the token it captured against the store's, so a reveal that was
 * started for a question the player has since left, or for a run that has since
 * been replaced, does nothing instead of writing into whatever is on screen now.
 * `leaveGame` and `startGame` bump the token; both live outside this file, which
 * is exactly why the token cannot: a private counter here would be invisible to
 * the two places that need to invalidate a flight.
 *
 * `flightKey` is the other half. It is the run and question this flight belongs
 * to, and the guard on the first line is what keeps a second `renderGame` during
 * a flight from restarting the choreography from the beginning.
 */
import type { Country, Question } from '../../engine/types.ts';
import { requireAudio, requireGlobe, store } from '../state.ts';
import { STORE } from '../storage.ts';
import { $, dialog, optional, persist, seconds } from '../dom.ts';
import { bindExit, footer, questionHeader, renderGame, renderWorldHeader, saveGame, stopClock } from './game.ts';

export function beginFlight(q: Question, c: Country): void {
  const game=store.game!,globe=requireGlobe(),audio=requireAudio();
  const key=`${game.created}:${game.index}`;if(store.phase==='flying'&&store.flightKey===key&&globe.flight)return;
  stopClock();store.clock=null;store.clockIndex=-1;game.clock=null;store.phase='flying';store.flightKey=key;const token=++store.revealToken,bonus=q.type==='flag';
  globe.setMotion(store.options.motion==='full');
  document.body.classList.add('flying');document.body.classList.remove('question-paused','flag-question');$('mobile-hud').hidden=true;
  document.querySelectorAll<HTMLButtonElement>('.globe-controls button').forEach(b=>{b.disabled=true;});
  renderWorldHeader(q,c,undefined,true);
  $('side-panel').innerHTML=questionHeader(q)+`<div class="flight-card"><div class="eyebrow accent">${bonus?'ODDECH PŘED VLAJKOVÝM BONUSEM':'ODDECH PŘED DALŠÍ ZEMÍ'}</div><div class="rest-countdown"><strong id="rest-seconds">12,0</strong><span>sekund</span></div><h2 id="flight-title">Svět počká.</h2><p id="flight-description">${bonus?'Tři celé otočky zeměkoule. Potom poznávání vlajky.':'Tři celé otočky zeměkoule. Pak zaměření a přiblížení.'}</p><div class="rest-track" role="progressbar" aria-label="Průběh oddechu" aria-valuemin="0" aria-valuemax="12" aria-valuenow="0" id="rest-track"><span id="rest-fill"></span></div><div class="flight-steps"><span data-flight-step="spin">01 / TŘI OTOČKY</span><span data-flight-step="settle">02 / ZAMĚŘENÍ</span><span data-flight-step="zoom">03 / ${bonus?'BONUS':'PŘIBLÍŽENÍ'}</span></div><div class="rest-detail" id="rest-detail">Odpočet otázky ještě neběží.</div><p class="flight-footnote">${bonus?'Bonus nestojí žádný pokus.':'Nový stát: −1 pokus již zaplacen za všech pět otázek.'}<br>Čas otázky během oddechu neběží.</p><button class="text-button motion-flight" id="flight-motion">${store.options.motion==='full'?'Omezit pohyb':'Zapnout plné otáčení'}</button></div>`+footer();bindExit();
  $('flight-motion').onclick=()=>{store.options.motion=store.options.motion==='full'?'reduced':'full';persist(STORE.settings,store.options);globe.setMotion(store.options.motion==='full');$('flight-motion').textContent=store.options.motion==='full'?'Omezit pohyb':'Zapnout plné otáčení';};
  $('flight-status').hidden=false;$('flight-status').textContent='ODDECH · 12 s';
  audio.setRegion(c.region);audio.setScene('flight');audio.setPaused(document.hidden||dialog().open);audio.cue('flight');
  globe.reveal(c,{neutral:bonus,onStage:stage=>{
    if(token!==store.revealToken||store.view!=='game')return;
    const text=({depart:['Chvíle na oddech.','Oddalujeme glóbus před dalším putováním.'],spin:['Svět se točí.','Tři celé otočky. Žádný spěch, odpočet otázky čeká.'],settle:[bonus?'Zastavujeme glóbus.':'Zaměřujeme cíl.',bonus?'Poloha země zůstává utajená.':'Otáčení zpomaluje a glóbus se zastaví.'],zoom:[bonus?'Přichází vlajkový bonus.':'Přibližujeme zemi.',bonus?'Poznáte vlajku? Správná odpověď přidá body i pokus.':'Připravte se. Odpočet začne až po příletu.']} as Record<string, [string, string]>)[stage]!;
    if(optional('flight-title'))$('flight-title').textContent=text[0];if(optional('flight-description'))$('flight-description').textContent=text[1];
    document.querySelectorAll<HTMLElement>('[data-flight-step]').forEach(e=>{e.classList.toggle('active',e.dataset['flightStep']===(stage==='depart'?'spin':stage));});
    if(stage==='zoom')audio.cue(bonus?'bonus':'zoom');
  },onProgress:state=>{
    if(token!==store.revealToken||!optional('rest-seconds'))return;
    $('rest-seconds').textContent=seconds(state.remainingMs);$('rest-fill').style.transform=`scaleX(${state.progress})`;
    $('rest-track').setAttribute('aria-valuenow',String(Math.floor(state.elapsed/1000)));
    const label=!state.motion?'KLIDOVÝ REŽIM':state.stage==='spin'?`OTOČKA ${Math.min(3,state.turnsCompleted+1)} / 3`:state.stage==='settle'?'ZAMĚŘENÍ':state.stage==='zoom'?(bonus?'VLAJKOVÝ BONUS':'PŘIBLÍŽENÍ'):'ODLET';
    $('flight-status').textContent=`${label} · ODDECH ${Math.ceil(state.remainingMs/1000)} s`;
    $('rest-detail').textContent=state.motion?`Dokončené otočky: ${state.turnsCompleted} / 3 · odpočet otázky čeká`:'Bez pohybu · délka oddechu zůstává 12 sekund';
  },onComplete:()=>{
    if(token!==store.revealToken||store.view!=='game'||store.game!.questions[store.game!.index]!==q)return;
    const current=store.game!;
    current.revealedIndex=current.index;store.lastGlobeCode=bonus?'__bonus__':c.code;store.flightKey=null;store.phase='question';$('flight-status').hidden=true;document.body.classList.remove('flying');
    document.querySelectorAll<HTMLButtonElement>('.globe-controls button').forEach(b=>{b.disabled=false;});
    audio.cue(bonus?'bonus':'arrival');renderGame();
    if(innerWidth<701)$('side-panel').scrollIntoView({block:'start',behavior:'auto'});
    saveGame();
  }});
  if(document.hidden||dialog().open)globe.pauseFlight(true);
  if(innerWidth<701)requestAnimationFrame(()=>{document.querySelector('.canvas-wrap')!.scrollIntoView({block:'start',behavior:'auto'});});
  else window.scrollTo({top:0,behavior:'auto'});
  saveGame();
}
