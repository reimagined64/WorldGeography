/**
 * The data-and-methodology dialog, plus the JSON export button it owns.
 *
 * Everything it prints comes from `database.ts`: the citation list, the country
 * database and the licence text are read out of the page's inert `<script type>`
 * blocks once during boot, so this module reads no DOM of its own beyond the
 * button it just rendered.
 *
 * `EDITION` is the one fact on this page a reader has no way to check, and it
 * is the one thing here that is not prose: `npm run data:refresh -- --accept`
 * rewrites this single constant, `npm run data:check` fails when it disagrees
 * with `data/raw/countries.json`, and both the Czech sentence and the JSON
 * export read it from here. It used to be written twice, by hand, in two
 * formats — and both said "7. září 2026" for a month after the data moved.
 */
import { countries, licenseText, sources } from '../database.ts';
import type { LocalizedText } from '../../engine/types.ts';
import { $, esc } from '../dom.ts';
import { locale, t } from '../../i18n/index.ts';
import { pick } from '../../i18n/questions.ts';
import { openDialog } from '../main.ts';

/**
 * One entry of `data/build/sources.json`.
 *
 * `name` and `use` follow the reader, because a citation is prose that says
 * what the source was used for; the `url` is the same link either way. This
 * declaration is the runtime half of the one in `scripts/data/sources.ts` — the
 * build never imports the pipeline — and `tests/unit/english-copy.test.ts` asserts the
 * two still describe the same record.
 */
export interface SourceEntry {
  name: LocalizedText;
  url: string;
  use: LocalizedText;
}

/**
 * The ISO date of the dataset in `data/build/`.
 *
 * Machine-written by an accepted refresh. Keep it a bare string literal on its
 * own line: the regenerator rewrites it by pattern, and an expression here
 * would not be rewritten.
 */
export const EDITION = '2026-09-15';

/**
 * `2026-09-15` → `15. září 2026` in Czech, `September 15, 2026` in English.
 *
 * The tag is the bare `en`, so the order is the one ICU gives that tag, which
 * is the American one. The catalog around it is written in British English —
 * "licence", "recognised", "Traveller" — so the two do not agree, and this says
 * so rather than leaving a reader to find it. Pinning `en-GB` here would change
 * a string U11 committed and that the browser suite measures, so it is a
 * decision to take deliberately rather than in passing.
 */
export const editionDate = (iso: string = EDITION): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale(), {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

const section = (title: string, body: string): string => `<h3>${title}</h3><p>${body}</p>`;

export function showSources(): void {
  openDialog(`<h2 id="dialog-title">${t('sources.title')}</h2><p>${t('sources.edition',{date:editionDate()})}</p>${section(t('sources.populationTitle'),t('sources.population'))}${section(t('sources.namesTitle'),t('sources.names'))}${section(t('sources.mapTitle'),t('sources.map'))}${sources.map(s=>`<div class="source-item"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(pick(s.name))} ↗</a><p>${esc(pick(s.use))}</p></div>`).join('')}${section(t('sources.flagsTitle'),t('sources.flags'))}${section(t('sources.privacyTitle'),t('sources.privacy'))}<details class="license-details"><summary>${t('sources.licenseSummary')}</summary><pre>${esc(licenseText)}</pre></details><button id="export-data" class="secondary full">${t('sources.export')}</button>`);
  $('export-data').onclick=()=>{const blob=new Blob([JSON.stringify({edition:EDITION,countries,sources},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=t('sources.exportFile');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
