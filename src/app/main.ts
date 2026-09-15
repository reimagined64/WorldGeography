/**
 * The shell: navigation, the dialog, the sound button, the global listeners,
 * and the boot sequence that assembles all of it.
 *
 * What lives here is what is not a screen. `setView` is the only place that
 * touches the body classes and the two view sections, `leaveGame` is the only
 * place that turns a live run back into a saved one, and the three document
 * listeners are the only input the game takes that is not a click on something
 * a view rendered.
 *
 * `renderView` is the dispatcher: one render function per screen, looked up
 * rather than called by name. v7 had no such thing — every navigation named its
 * target directly — which is why nothing could re-render "whatever is on screen"
 * after a setting changed. `rerender` is that, and it is what a locale switch
 * will need.
 *
 * `boot` is a function rather than a module body so that the module can be
 * imported without a browser: `src/main.ts` calls it, and a Node suite can
 * install the database and render a view instead. It keeps v7's order exactly —
 * data, validation, settings, synthesizer, saved run, globe, listeners, debug
 * API, first render — because several of those steps read what the one before
 * them wrote.
 */
import * as Core from '../engine/core.ts';
import { GeoAudio } from '../audio/audio.ts';
import { Globe, type MapPolygon } from '../globe/globe.ts';
import type { LocalizedCountry } from '../engine/types.ts';
import { installDebugApi, requireAudio, requireGlobe, store, type View } from './state.ts';
import { STORE, loadAudioSettings, loadRecord, loadRun, loadSettings } from './storage.ts';
import { installDatabase, type Database } from './database.ts';
import { $, dialog, esc, notify, optional, persist } from './dom.ts';
import { detectLocale, locale, LOCALES, LOCALE_NAMES, setLocale, t } from '../i18n/index.ts';
import { translateChrome } from '../i18n/chrome.ts';
import { questionBundle } from '../i18n/questions.ts';
import { showAudioSettings } from './dialogs/audio-settings.ts';
import { showHelp } from './dialogs/help.ts';
import { showSources } from './dialogs/sources.ts';
import type { SourceEntry } from './dialogs/sources.ts';
import { renderAtlas } from './views/atlas.ts';
import { renderGame, pauseQuestion, resumeQuestion, choose, nextQuestion, saveGame, snapshotClock, stopClock } from './views/game.ts';
import { captureSettings, renderHome } from './views/home.ts';
import { renderResults } from './views/results.ts';

/**
 * The dispatcher. The entries are wrappers rather than the imported functions
 * themselves so that the table can be built while the view modules are still
 * being evaluated — every screen imports something from this file, so the graph
 * is a cycle whichever way it is drawn.
 */
const RENDERERS: Readonly<Record<View, () => void>> = Object.freeze({
  home: (): void => { renderHome(); },
  game: (): void => { renderGame(); },
  atlas: (): void => { renderAtlas(); },
  results: (): void => { renderResults(); },
});

/** Render one screen. The only way in this tree to switch what is displayed. */
export function renderView(next: View): void {
  RENDERERS[next]();
}

/** Render whatever is on screen again, after something under it changed. */
export function rerender(): void {
  RENDERERS[store.view]();
}

/**
 * Turn a live run back into a saved one.
 *
 * Both branches matter. A running question is paused and its clock folded into
 * the save, or the player would be charged for the time they spent elsewhere.
 * A flight is cancelled *and* its token bumped: cancelling stops the globe, and
 * the token is what stops a callback that is already in flight from landing on
 * the screen the player just navigated to.
 */
export function leaveGame(): void {
  if(store.view!=='game')return;
  if(store.phase==='question'){stopClock();store.phase='paused';snapshotClock();}
  if(store.phase==='flying'){requireGlobe().cancelFlight();store.revealToken++;store.flightKey=null;}
  saveGame();store.phase='idle';$('flight-status').hidden=true;$('mobile-hud').hidden=true;
  document.body.classList.remove('flying','question-paused','flag-question');
  document.querySelectorAll<HTMLButtonElement>('.globe-controls button').forEach(b=>{b.disabled=false;});
}

export function setView(next: View): void {
  if(next!=='game')leaveGame();store.view=next;
  // The switcher's enabled state is a function of which screen is up and
  // whether a run is live, and `setView` is the only place that knows either
  // has changed. Rendering it here rather than from each screen is what keeps
  // "starting a run locks the control" from depending on every future caller
  // remembering to say so.
  renderLanguage();
  document.body.classList.toggle('game-active',next==='game');document.body.classList.toggle('atlas-active',next==='atlas');
  $('main-view').hidden=next==='results';$('results-view').hidden=next!=='results';$('nav-atlas').classList.toggle('active',next==='atlas');$('nav-play').classList.toggle('active',next!=='atlas');
  if(next!=='game'){requireAudio().setPaused(document.hidden);requireAudio().setScene(next==='results'?'results':'home');}
}

export function openDialog(html: string): void {
  if(store.phase==='question')pauseQuestion();if(store.phase==='flying'){requireGlobe().pauseFlight(true);requireAudio().setPaused(true);}$('dialog-content').innerHTML=html;if(!dialog().open)dialog().showModal();$('dialog-close').focus();
}

export function renderSound(): void {
  const audio=requireAudio();
  const pending=audio.enabled&&!audio.unlocked,active=audio.enabled&&audio.unlocked&&!audio.paused;
  const action=pending?t('sound.start'):audio.enabled?t('sound.turnOff'):t('sound.turnOn');
  $('sound').innerHTML=`<span aria-hidden="true">${audio.enabled?'♪':'♩'}</span><span class="sound-label">${audio.enabled?t('sound.labelOn'):t('sound.labelOff')}</span>`;
  $('sound').classList.toggle('sound-on',active);$('sound').setAttribute('aria-pressed',String(audio.enabled));
  $('sound').setAttribute('aria-label',action);
  $('sound').title=t('sound.shortcut',{action});
  const note=optional('home-sound');
  if(note)note.textContent=audio.failed?t('sound.unavailable'):!audio.enabled?t('sound.off'):pending?t('sound.pending'):t('sound.on');
}

/**
 * The language this switcher would switch to.
 *
 * A list rather than a boolean: a third locale should mean one more entry in
 * `LOCALES`, not a rebuilt control. With two it cycles, which is what a single
 * button can do.
 */
export const nextLocale = (from = locale()): (typeof LOCALES)[number] =>
  LOCALES[(LOCALES.indexOf(from) + 1) % LOCALES.length]!;

/** True while a run is on screen and its questions are already in one language. */
export const runInProgress = (): boolean =>
  store.game !== null && !store.game.completed && store.view === 'game';

/**
 * The switcher: two letters a reader sees, a name a screen reader says.
 *
 * The visible label is the code of the language it switches *to*, matching the
 * sound button next to it, which also names the action rather than the state.
 * The accessible name is the target language's own name, carrying its own
 * `lang` — "English", pronounced as English, not as Czech letters — which is
 * why it is markup rather than an `aria-label`: an attribute cannot carry a
 * language of its own.
 *
 * It is disabled while a run is in progress. A run bakes its question strings
 * at creation, so switching mid-run would render exactly the mixed-language
 * screen KTD13 calls a defect; the title says so in both languages rather than
 * leaving a dead control unexplained.
 */
export function renderLanguage(): void {
  const next = nextLocale();
  const button = $('language') as HTMLButtonElement;
  const locked = runInProgress();
  button.innerHTML =
    `<span aria-hidden="true">${next.toUpperCase()}</span>` +
    `<span class="visually-hidden" lang="${next}">${esc(LOCALE_NAMES[next])}</span>`;
  button.disabled = locked;
  button.title = locked ? t('language.lockedDuringRun') : t('language.switchTo', { name: LOCALE_NAMES[next] });
}

/**
 * Switch, re-render, and put the focus back where the reader left it.
 *
 * The re-render destroys the button that was just activated, so without the
 * restore the focus falls to `document.body` and a keyboard reader loses their
 * place in the header. The announcement goes through the toast, which is
 * already a polite `role="status"` region, and is written in the language just
 * switched to — announcing "English" in Czech would be the one message
 * guaranteed to reach the wrong reader.
 */
export function switchLanguage(to = nextLocale()): void {
  if (runInProgress()) return;
  setLocale(to);
  store.options.lang = to;
  persist(STORE.settings, store.options);
  document.documentElement.lang = to;
  translateChrome();
  rerender();
  renderSound();
  renderLanguage();
  $('language').focus();
  notify(t('language.switched', { name: LOCALE_NAMES[to] }));
}

/** `1`–`3` and `A`–`C` answer directly; the arrows move the highlight instead. */
const KEY_ANSWERS: Readonly<Record<string, number | undefined>> = { '1': 0, '2': 1, '3': 2, a: 0, b: 1, c: 2 };
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export function handleKeydown(e: KeyboardEvent): void {
  const target=e.target as HTMLElement|null;
  if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||['INPUT','SELECT','TEXTAREA'].includes(target?.tagName??'')||dialog().open)return;
  const k=e.key.toLowerCase();if(k==='m'){e.preventDefault();$('sound').click();return;}
  const game=store.game;
  if(store.view!=='game'||!game)return;
  if(k==='p'){e.preventDefault();if(store.phase==='paused')resumeQuestion();else pauseQuestion();return;}
  if(store.phase==='flying'||store.phase==='paused')return;
  const answer=game.answers[game.index];
  if(!answer){const idx=KEY_ANSWERS[k];if(idx!==undefined){e.preventDefault();choose(idx);return;}
    if(ARROWS.includes(e.key)){e.preventDefault();store.selected=(store.selected+(['ArrowUp','ArrowLeft'].includes(e.key)?2:1))%3;document.querySelectorAll<HTMLElement>('[data-answer]').forEach(b=>{b.classList.toggle('key-selected',Number(b.dataset['answer'])===store.selected);});document.querySelector<HTMLElement>(`[data-answer="${store.selected}"]`)?.focus({preventScroll:true});requireAudio().cue('select');}
    if(e.key==='Enter'&&target?.tagName!=='BUTTON'){e.preventDefault();choose(store.selected);}
  }else if(e.key==='Enter'&&target?.tagName!=='BUTTON'){e.preventDefault();nextQuestion();}
}

/** The four inert JSON blocks and the licence text, read out of the page. */
function readInert<T>(id: string): T {
  return JSON.parse($(id).textContent ?? 'null') as T;
}

export function boot(): void {
  const countries=readInert<LocalizedCountry[]>('country-data'),map=readInert<MapPolygon[]>('map-data'),sources=readInert<SourceEntry[]>('source-data'),flags=readInert<Record<string,string>>('flag-data');
  // Language first: every string after this line — the boot failure message
  // included — is read out of the catalog, `loadSettings` resolves the two
  // placeholder player names through it, and since U12 `validateCountries`
  // states its complaint in it too. Settings are read twice on purpose: once to
  // find the stored choice detection has to honour, and once more so the
  // placeholders follow whichever language that produced.
  store.options=loadSettings();
  setLocale(detectLocale(navigator.languages ?? [navigator.language], store.options.lang));
  store.options=loadSettings();
  document.documentElement.lang=locale();
  translateChrome();
  try{Core.validateCountries(countries,questionBundle());}catch(e){$('side-panel').textContent=t('boot.databaseFailed',{message:(e as Error).message});return;}
  const byCode=Object.fromEntries(countries.map(c=>[c.code,c])) as Database['byCode'];
  installDatabase({countries,byCode,flags,sources,licenseText:$('license-data').textContent ?? ''});
  store.record=loadRecord();
  store.audio=new GeoAudio(loadAudioSettings());
  store.game=loadRun(countries,byCode);
  // A v7 save carries no language, so `loadRun` reads it as Czech; the session
  // follows it rather than re-rendering a Czech run into an English shell. The
  // switcher puts it back the moment the run is finished or left.
  if(store.game&&store.game.lang!==undefined&&store.game.lang!==locale()){setLocale(store.game.lang);document.documentElement.lang=locale();translateChrome();}
  store.globe=new Globe($('globe') as HTMLCanvasElement,map);store.globe.setMotion(store.options.motion==='full');
  store.audio.onChange=renderSound;

  $('nav-play').onclick=()=>{requireAudio().unlock();if(store.game&&!store.game.completed)renderView('game');else renderView('home');window.scrollTo({top:0,behavior:'auto'});};
  $('brand').onclick=()=>{if(store.view==='home')captureSettings();renderView('home');window.scrollTo({top:0,behavior:'auto'});};
  $('nav-atlas').onclick=()=>{if(store.view==='home')captureSettings();renderView('atlas');window.scrollTo({top:0,behavior:'auto'});};
  $('language').onclick=()=>{switchLanguage();};
  $('nav-help').onclick=()=>{showHelp(openDialog);};$('data-button').onclick=()=>{showSources();};$('dialog-close').onclick=()=>{dialog().close();};$('sound-options').onclick=()=>{showAudioSettings();};
  dialog().addEventListener('click',e=>{if(e.target===dialog()){const r=dialog().getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog().close();}});
  dialog().addEventListener('close',()=>{if(store.phase==='flying'){requireGlobe().pauseFlight(document.hidden);requireAudio().setScene('flight');requireAudio().setPaused(document.hidden);}else if(store.phase==='paused')requireAudio().setPaused(true);else{requireAudio().setScene(store.view==='results'?'results':store.view==='game'?'feedback':'home');requireAudio().setPaused(document.hidden);}});
  $('sound').onclick=()=>{
    const audio=requireAudio();
    if(audio.enabled&&!audio.unlocked){audio.unlock();return;}
    audio.configure({enabled:!audio.enabled});persist(STORE.audio,audio.settings());if(audio.enabled)audio.unlock();
  };
  $('zoom-in').onclick=()=>requireGlobe().setZoom(requireGlobe().targetZoom+.25);$('zoom-out').onclick=()=>requireGlobe().setZoom(requireGlobe().targetZoom-.25);$('globe-reset').onclick=()=>requireGlobe().reset();
  document.addEventListener('keydown',handleKeydown);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){if(store.phase==='question')pauseQuestion();requireGlobe().pauseFlight(true);requireAudio().setPaused(true);saveGame();}
    else if(store.phase==='flying'&&!dialog().open){requireGlobe().pauseFlight(false);requireAudio().setPaused(false);}
    else if(store.phase!=='paused')requireAudio().setPaused(false);
  });
  window.addEventListener('pagehide',()=>{if(store.clock?.running){stopClock();store.phase='paused';}saveGame();requireAudio().setPaused(true);});
  installDebugApi(window as unknown as Record<string, unknown>);
  renderView('home');renderSound();renderLanguage();
}
