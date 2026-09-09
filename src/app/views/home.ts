/**
 * The setup screen, and the two ways a run starts from it.
 *
 * Every control on it writes through immediately rather than on submit:
 * `captureSettings` runs on each change and on the way out of the screen, so a
 * player who types a name and then navigates to the atlas still has that name
 * when they come back. That is also why the player-count buttons re-render the
 * whole panel — the second name field only exists in the two-player layout.
 *
 * `startGame` bumps `revealToken` before it builds anything. A run replaced
 * while an arrival flight is still in the air would otherwise let the old
 * flight's `onComplete` land on the new game's first question.
 */
import * as Core from '../../engine/core.ts';
import type { Difficulty, RegionFilter } from '../../engine/types.ts';
import { requireAudio, requireGlobe, store } from '../state.ts';
import { DEFAULT_SETTINGS, STORE } from '../storage.ts';
import { countries } from '../database.ts';
import { $, ALL_TYPES, dialog, esc, lifePips, notify, optional, persist, regionOptions } from '../dom.ts';
import { openDialog, renderSound, setView } from '../main.ts';
import { renderGame, saveGame, scrollQuestion, stopClock } from './game.ts';

/** Read the panel back into the options. Called on every change, not on submit. */
export function captureSettings(): void {
  ['p1-name','p2-name'].forEach((id,i)=>{const field=optional(id) as HTMLInputElement|null;if(field)store.options.names[i]=(field.value.trim()||DEFAULT_SETTINGS.names[i]!).slice(0,24);});
  if(optional('difficulty'))store.options.difficulty=($('difficulty') as HTMLSelectElement).value as Difficulty;
  if(optional('region'))store.options.region=($('region') as HTMLSelectElement).value as RegionFilter;
  if(optional('motion-mode'))store.options.motion=($('motion-mode') as HTMLSelectElement).value as 'full'|'reduced';
  persist(STORE.settings,store.options);
}

export function renderHome(): void {
  setView('home');store.lastGlobeCode=null;requireGlobe().home();requireGlobe().setMotion(store.options.motion==='full');$('globe').setAttribute('aria-label','Otočný glóbus světa. Táhněte pro otočení, použijte plus a minus pro přiblížení.');
  $('world-heading').innerHTML=`<div class="eyebrow accent">ARCADE EDITION / VERZE 7.0</div><h1>Tři otočky.<br><em>A další šance.</em></h1><p class="intro-line">Zeměpisná klasika inspirovaná Commodorem 64.<br>Hrajte, dokud vám zbývá alespoň jeden pokus.</p>`;
  $('world-caption').innerHTML=`<div class="globe-stats"><div><strong>195</strong><span>zemí a vlajek</span></div><div><strong>5</strong><span>počátečních pokusů</span></div><div><strong>∞</strong><span>otázek ve hře</span></div></div><div class="coord">1985 → 2026<br>VLAJKOVÝ BONUS</div>`;
  $('side-panel').innerHTML=`<div class="section-title"><h2>Vaše příští expedice</h2><span class="number">01 /</span></div><p class="panel-intro">Pět pokusů. Žádný pevný počet kol.</p>
  <div class="settings-section"><span class="field-label" id="players-label">Počet hráčů</span><div class="segmented" role="group" aria-labelledby="players-label"><button data-players="1" aria-pressed="${store.options.players===1}">Jeden hráč</button><button data-players="2" aria-pressed="${store.options.players===2}">Dva hráči</button></div>
  <div class="players-fields"><label><span class="field-label">${store.options.players===2?'První hráč':'Vaše jméno'}</span><input id="p1-name" type="text" maxlength="24" value="${esc(store.options.names[0])}" autocomplete="off"></label>${store.options.players===2?`<label><span class="field-label">Druhý hráč</span><input id="p2-name" type="text" maxlength="24" value="${esc(store.options.names[1])}" autocomplete="off"></label>`:''}</div></div>
  <div class="setting-row"><label><span class="field-label">Obtížnost</span><select id="difficulty"><option value="easy"${store.options.difficulty==='easy'?' selected':''}>Průzkumník</option><option value="normal"${store.options.difficulty==='normal'?' selected':''}>Cestovatel</option><option value="expert"${store.options.difficulty==='expert'?' selected':''}>Kartograf</option></select></label><label><span class="field-label">Oblast</span><select id="region">${regionOptions(store.options.region)}</select></label></div>
  <div class="survival-rule"><div class="survival-rule-top"><span>NA STARTU</span>${lifePips(5)}<strong>5 pokusů</strong></div><p>Nový stát: <b>−1 pokus za všech 5 otázek.</b><br>Každých 10 000 bodů: <b>+2 pokusy hned</b> a po dokončení státu vlajkový bonus o <b>body a další +1 pokus.</b> Chyby pokusy neodebírají.</p></div>
  <label class="motion-setting"><span class="field-label">Oddech před zemí i bonusem · 12 sekund</span><select id="motion-mode"><option value="full"${store.options.motion==='full'?' selected':''}>Plné otáčení · 3 celé otočky a přiblížení</option><option value="reduced"${store.options.motion==='reduced'?' selected':''}>Klidový režim · stejný oddech, bez pohybu</option></select></label>
  <p class="length-note" id="length-note"></p><div class="category-row">${ALL_TYPES.map((type,i)=>`<span class="category-chip ${type==='flag'?'bonus-chip':''}">${type==='flag'?'+':String(i+1).padStart(2,'0')} ${Core.LABELS[type]}</span>`).join('')}</div>
  <button id="start" class="primary"><span>Zahájit expedici</span><span class="arrow" aria-hidden="true">→</span></button>
  ${store.game&&!store.game.completed?`<button id="resume" class="secondary full">Pokračovat · otázka ${store.game.index+1}${store.game.review?' · trénink':` · ${store.game.lives.join(' / ')} pokusů`}</button>`:''}
  <p class="sound-note" id="home-sound"></p><div class="setup-bottom"><span id="setup-time"></span><span>${store.record?`REKORD <strong>${Number(store.record.points||0).toLocaleString('cs-CZ')} BODŮ</strong>`:'<strong>AŽ 1 000 BODŮ</strong> ZA ODPOVĚĎ'}</span></div>`;
  document.querySelectorAll<HTMLElement>('[data-players]').forEach(b=>{b.onclick=()=>{captureSettings();store.options.players=Number(b.dataset['players']);persist(STORE.settings,store.options);renderHome();};});
  ['difficulty','region','motion-mode'].forEach(id=>{$(id).onchange=()=>{captureSettings();requireGlobe().setMotion(store.options.motion==='full');updateLengthNote();};});
  ['p1-name','p2-name'].forEach(id=>{const field=optional(id);if(field)field.onchange=captureSettings;});
  $('start').onclick=()=>{captureSettings();if(store.game&&!store.game.completed)confirmNew();else startGame();};
  if(optional('resume'))$('resume').onclick=()=>{requireAudio().unlock();store.lastGlobeCode=null;renderGame();};
  updateLengthNote();renderSound();
}

function updateLengthNote(): void {
  $('length-note').textContent=`Výběr z ${Core.getPool(countries,store.options).length} zemí · 100 bodů základ + až 900 za rychlost.`;
  $('setup-time').textContent=`LIMIT ${Core.TIME_LIMITS[store.options.difficulty]/1000} s / OTÁZKA`;
}

export function startGame(): void {
  requireAudio().unlock();stopClock();store.clock=null;store.clockIndex=-1;store.revealToken++;store.flightKey=null;store.phase='idle';
  try{store.game=Core.makeGame(countries,{...store.options,names:[...store.options.names]});store.lastGlobeCode=null;store.selected=0;saveGame();renderGame();scrollQuestion(true);}catch(e){notify((e as Error).message);}
}

function confirmNew(): void {
  openDialog(`<h2 id="dialog-title">Zahájit novou expedici?</h2><p>Dosavadní rozehraná hra se nahradí. Uložený nejlepší výsledek zůstane zachovaný.</p><div class="dialog-controls"><button class="secondary" id="cancel-new">Zpět</button><button class="primary" id="confirm-new">Nová expedice →</button></div>`);
  $('cancel-new').onclick=()=>{dialog().close();};$('confirm-new').onclick=()=>{dialog().close();startGame();};
}
