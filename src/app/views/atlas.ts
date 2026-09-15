/**
 * The atlas: search, region filter, and the country card the globe follows.
 *
 * All three of its variables are genuinely local — nothing outside this view
 * has ever read the search box or the highlighted code — so they stay module
 * scoped rather than moving into the shared store. The one piece it does share
 * is `lastGlobeCode`, because the game reads it to decide whether the globe
 * already shows the country it is about to ask about.
 *
 * Rendering helpers are imported rather than reimplemented: two copies of `esc`
 * is one copy too many. Until U16 they arrived through a host object the
 * monolith built, which is the same idea with an extra indirection in it.
 */
import * as Core from '../../engine/core.ts';
import { requireGlobe, store } from '../state.ts';
import { byCode, countries } from '../database.ts';
import { $, coords, esc, flagImage, pointText, regionOptions } from '../dom.ts';
import { locale, regionName, t } from '../../i18n/index.ts';
import { showSources } from '../dialogs/sources.ts';
import { setView } from '../main.ts';

let atlasCode = 'CZ';
let atlasQuery = '';
let atlasRegion = 'all';

const normalize=(t: string)=>String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function renderAtlas(): void {
  setView('atlas');$('world-heading').innerHTML=`<div class="atlas-heading"><div class="eyebrow accent">${t('atlas.eyebrow')}</div><h1>${t('atlas.title')}</h1><p class="intro-line">${t('atlas.intro')}</p></div>`;
  $('side-panel').innerHTML=`<div class="section-title"><h2>${t('atlas.panelTitle')}</h2><span class="number">02 /</span></div><div class="atlas-search"><label><span class="field-label">${t('atlas.searchLabel')}</span><input id="atlas-search" type="search" value="${esc(atlasQuery)}" placeholder="${esc(t('atlas.searchPlaceholder'))}" autocomplete="off"></label></div><label class="settings-section"><span class="field-label">${t('home.region')}</span><select id="atlas-region">${regionOptions(atlasRegion)}</select></label><div id="atlas-list" class="atlas-list" aria-label="${esc(t('atlas.listLabel'))}"></div><div id="atlas-details" class="atlas-details"></div>`;
  $('atlas-search').oninput=e=>{atlasQuery=(e.target as HTMLInputElement).value;renderAtlasList();};$('atlas-region').onchange=e=>{atlasRegion=(e.target as HTMLSelectElement).value;renderAtlasList();};renderAtlasList();selectAtlas(atlasCode);
}

function renderAtlasList(): void {const query=normalize(atlasQuery),matches=countries.filter(c=>(atlasRegion==='all'||c.region===atlasRegion)&&[c.name,c.code,c.iso3].some(s=>normalize(s).includes(query))).sort((a,b)=>a.name.localeCompare(b.name,locale()));
  $('atlas-list').innerHTML=matches.length?matches.map(c=>`<button class="atlas-item ${c.code===atlasCode?'active':''}" data-country="${c.code}" aria-pressed="${c.code===atlasCode}"><span class="atlas-country-name">${flagImage(c.code)}${esc(c.name)}</span><span>${c.code} ↗</span></button>`).join(''):`<p class="empty">${t('atlas.noMatch')}</p>`;
  document.querySelectorAll<HTMLElement>('[data-country]').forEach(b=>{b.onclick=()=>selectAtlas(b.dataset['country']!);});
}

function selectAtlas(code: string): void {atlasCode=code;const c=byCode[code]!;requireGlobe().focus(c);store.lastGlobeCode=code;$('globe').setAttribute('aria-label',t('globe.atlas',{name:c.name}));
  $('world-caption').innerHTML=`<div class="country-caption">${flagImage(c.code)}<div><div class="caption-title">${esc(c.name)}</div><div class="caption-sub">${esc(regionName(c.region))} / ${c.iso3}</div></div></div><div class="coord">${coords(c)}</div>`;
  const cap=c.code==='ID'?t('atlas.capitalIndonesia'):c.capital.join(' / ');
  $('atlas-details').innerHTML=`<div class="atlas-flag-heading">${flagImage(c.code)}<h3>${esc(c.name)}</h3></div>${c.code==='AF'?`<p class="flag-caveat">${t('atlas.flagCaveat')}</p>`:''}<div class="fact-row"><span class="fact-label">${t('atlas.factCapital')}</span><span class="fact-value">${esc(cap)}</span></div><div class="fact-row"><span class="fact-label">${t('atlas.factCurrency')}</span><span class="fact-value">${c.currencyNames.map(m=>`${esc(m.name)} (${m.code})`).join('<br>')}</span></div><div class="fact-row"><span class="fact-label">${t('atlas.factLanguages')}</span><span class="fact-value">${esc(c.languageNames.join(', '))}</span></div><div class="fact-row"><span class="fact-label">${t('atlas.factPopulation')}</span><span class="fact-value">${pointText(c.population)}<small>${esc(t('atlas.projection',{year:c.populationYear,provenance:Core.populationProvenance(c.populationSource)}))}</small></span></div><div class="atlas-note">${esc(c.note||t('atlas.defaultNote'))}<br><button class="text-button" id="atlas-source">${t('atlas.sources')}</button></div>`;
  document.querySelectorAll<HTMLElement>('[data-country]').forEach(b=>{b.classList.toggle('active',b.dataset['country']===code);b.setAttribute('aria-pressed',String(b.dataset['country']===code));});$('atlas-source').onclick=()=>{showSources();};
}
