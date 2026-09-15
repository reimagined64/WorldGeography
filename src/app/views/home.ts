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
import { defaultNames, STORE } from '../storage.ts';
import { countries } from '../database.ts';
import {
  $, ALL_TYPES, attempts, dialog, esc, lifePips, notify, optional, persist, pointText, regionOptions,
} from '../dom.ts';
import { kindName, locale, t } from '../../i18n/index.ts';
import { questionBundle } from '../../i18n/questions.ts';
import { openDialog, renderSound, setView } from '../main.ts';
import { renderGame, saveGame, scrollQuestion, stopClock } from './game.ts';

/** Read the panel back into the options. Called on every change, not on submit. */
export function captureSettings(): void {
  ['p1-name','p2-name'].forEach((id,i)=>{const field=optional(id) as HTMLInputElement|null;if(field)store.options.names[i]=(field.value.trim()||defaultNames()[i]!).slice(0,24);});
  if(optional('difficulty'))store.options.difficulty=($('difficulty') as HTMLSelectElement).value as Difficulty;
  if(optional('region'))store.options.region=($('region') as HTMLSelectElement).value as RegionFilter;
  if(optional('motion-mode'))store.options.motion=($('motion-mode') as HTMLSelectElement).value as 'full'|'reduced';
  persist(STORE.settings,store.options);
}

export function renderHome(): void {
  setView('home');store.lastGlobeCode=null;requireGlobe().home();requireGlobe().setMotion(store.options.motion==='full');$('globe').setAttribute('aria-label',t('globe.home'));
  $('world-heading').innerHTML=`<div class="eyebrow accent">${t('home.eyebrow')}</div><h1>${t('home.title')}</h1><p class="intro-line">${t('home.intro')}</p>`;
  $('world-caption').innerHTML=`<div class="globe-stats"><div><strong>195</strong><span>${t('home.statCountries')}</span></div><div><strong>5</strong><span>${t('home.statLives')}</span></div><div><strong>∞</strong><span>${t('home.statQuestions')}</span></div></div><div class="coord">${t('home.coord')}</div>`;
  const resumeDetail=(game: NonNullable<typeof store.game>): string=>
    game.review?t('home.resumeReview')
      :game.lives.length===1?t('home.resumeAttempts',{attempts:attempts(game.lives[0]!)})
      :t('home.resumeAttemptsDuel',{lives:game.lives.join(' / ')});
  $('side-panel').innerHTML=`<div class="section-title"><h2>${t('home.panelTitle')}</h2><span class="number">01 /</span></div><p class="panel-intro">${t('home.panelIntro')}</p>
  <div class="settings-section"><span class="field-label" id="players-label">${t('home.players')}</span><div class="segmented" role="group" aria-labelledby="players-label"><button data-players="1" aria-pressed="${store.options.players===1}">${t('home.onePlayer')}</button><button data-players="2" aria-pressed="${store.options.players===2}">${t('home.twoPlayers')}</button></div>
  <div class="players-fields"><label><span class="field-label">${store.options.players===2?t('home.firstPlayer'):t('home.yourName')}</span><input id="p1-name" type="text" maxlength="24" value="${esc(store.options.names[0])}" autocomplete="off"></label>${store.options.players===2?`<label><span class="field-label">${t('home.secondPlayer')}</span><input id="p2-name" type="text" maxlength="24" value="${esc(store.options.names[1])}" autocomplete="off"></label>`:''}</div></div>
  <div class="setting-row"><label><span class="field-label">${t('home.difficulty')}</span><select id="difficulty"><option value="easy"${store.options.difficulty==='easy'?' selected':''}>${esc(t('home.difficultyEasy'))}</option><option value="normal"${store.options.difficulty==='normal'?' selected':''}>${esc(t('home.difficultyNormal'))}</option><option value="expert"${store.options.difficulty==='expert'?' selected':''}>${esc(t('home.difficultyExpert'))}</option></select></label><label><span class="field-label">${t('home.region')}</span><select id="region">${regionOptions(store.options.region)}</select></label></div>
  <div class="survival-rule"><div class="survival-rule-top"><span>${t('home.ruleTop')}</span>${lifePips(5)}<strong>${t('home.ruleLives')}</strong></div><p>${t('home.ruleBody')}</p></div>
  <label class="motion-setting"><span class="field-label">${t('home.motionLabel')}</span><select id="motion-mode"><option value="full"${store.options.motion==='full'?' selected':''}>${esc(t('home.motionFull'))}</option><option value="reduced"${store.options.motion==='reduced'?' selected':''}>${esc(t('home.motionReduced'))}</option></select></label>
  <p class="length-note" id="length-note"></p><div class="category-row">${ALL_TYPES.map((type,i)=>`<span class="category-chip ${type==='flag'?'bonus-chip':''}">${type==='flag'?'+':String(i+1).padStart(2,'0')} ${esc(kindName(type))}</span>`).join('')}</div>
  <button id="start" class="primary"><span>${t('home.start')}</span><span class="arrow" aria-hidden="true">→</span></button>
  ${store.game&&!store.game.completed?`<button id="resume" class="secondary full">${t('home.resume',{number:store.game.index+1,detail:resumeDetail(store.game)})}</button>`:''}
  <p class="sound-note" id="home-sound"></p><div class="setup-bottom"><span id="setup-time"></span><span>${store.record?t('home.record',{points:pointText(Number(store.record.points||0))}):t('home.recordNone')}</span></div>`;
  document.querySelectorAll<HTMLElement>('[data-players]').forEach(b=>{b.onclick=()=>{captureSettings();store.options.players=Number(b.dataset['players']);persist(STORE.settings,store.options);renderHome();};});
  ['difficulty','region','motion-mode'].forEach(id=>{$(id).onchange=()=>{captureSettings();requireGlobe().setMotion(store.options.motion==='full');updateLengthNote();};});
  ['p1-name','p2-name'].forEach(id=>{const field=optional(id);if(field)field.onchange=captureSettings;});
  $('start').onclick=()=>{captureSettings();if(store.game&&!store.game.completed)confirmNew();else startGame();};
  if(optional('resume'))$('resume').onclick=()=>{requireAudio().unlock();store.lastGlobeCode=null;renderGame();};
  updateLengthNote();renderSound();
}

function updateLengthNote(): void {
  $('length-note').textContent=t('home.lengthNote',{count:Core.getPool(countries,store.options).length});
  $('setup-time').textContent=t('home.timeLimit',{seconds:Core.TIME_LIMITS[store.options.difficulty]/1000});
}

export function startGame(): void {
  requireAudio().unlock();stopClock();store.clock=null;store.clockIndex=-1;store.revealToken++;store.flightKey=null;store.phase='idle';
  try{store.game={...Core.makeGame(countries,{...store.options,names:[...store.options.names]},questionBundle()),lang:locale()};store.lastGlobeCode=null;store.selected=0;saveGame();renderGame();scrollQuestion(true);}catch(e){notify((e as Error).message);}
}

function confirmNew(): void {
  openDialog(`<h2 id="dialog-title">${t('home.confirmTitle')}</h2><p>${t('home.confirmBody')}</p><div class="dialog-controls"><button class="secondary" id="cancel-new">${t('home.confirmCancel')}</button><button class="primary" id="confirm-new">${t('home.confirmStart')}</button></div>`);
  $('cancel-new').onclick=()=>{dialog().close();};$('confirm-new').onclick=()=>{dialog().close();startGame();};
}
