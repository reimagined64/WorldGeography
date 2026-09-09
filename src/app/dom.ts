/**
 * The helpers every view prints with: the element lookup, the escaper, the
 * number and word formatters, the markup fragments that appear on more than one
 * screen, the toast, and the write-through wrapper that raises it.
 *
 * v7 declared all of these at the top of the one IIFE. That is precisely why
 * the views had to live in that file, and it is why they are here rather than
 * copied into each of them: two copies of `esc` is one copy too many, which is
 * the same argument the modules U6 extracted made when they still took these
 * through a host object.
 *
 * `toastTimer` and `storageWarningShown` are genuinely local and stay that way.
 * The warning is one-shot per page load by design — a browser that refuses the
 * first write refuses every later one, and a toast on each would bury the game.
 */
import * as Core from '../engine/core.ts';
import type { Coordinates, QuestionKind } from '../engine/types.ts';
import { byCode, flags } from './database.ts';
import { write } from './storage.ts';

/**
 * The five question types plus the flag bonus, in the order the home screen and
 * the results screen both print them. `Core.TYPES` is the playable five and
 * cannot carry `flag`: the engine walks it to find the next question in a
 * country, and a sixth entry there would queue a bonus into every visit.
 */
export const ALL_TYPES: readonly QuestionKind[] = Object.freeze([...Core.TYPES, 'flag'] as const);

/**
 * v7's `$`. Every id it is called with is in `index.template.html` or in markup
 * the caller just wrote, so the result is asserted rather than checked; the
 * handful of ids that only some renders emit go through `optional` instead.
 */
export function $(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

/** For ids a render may or may not have emitted. `null` is an ordinary answer. */
export function optional(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** The one dialog, typed: `open`, `showModal` and `close` are read all over. */
export function dialog(): HTMLDialogElement {
  return document.getElementById('dialog') as HTMLDialogElement;
}

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export const esc = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/** One decimal, Czech separator: the readout the clock and the flight share. */
export const seconds = (ms: number): string =>
  (Math.ceil(Math.max(0, ms) / 100) / 10).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const pointText = (n: number): string => n.toLocaleString('cs-CZ');

/** Czech counts one, few and many differently, and the UI says the number aloud. */
export const attemptWord = (n: number): string =>
  n === 1 ? 'pokus' : n >= 2 && n <= 4 ? 'pokusy' : 'pokusů';

export function lifePips(n: number): string {
  return `<span class="life-pips" aria-hidden="true">${Array.from({length:5},(_,i)=>`<i class="${i<n?'filled':''}"></i>`).join('')}${n>5?`<small>+${n-5}</small>`:''}</span>`;
}

export function coords(c: Coordinates): string {
  return `${Math.abs(c.lat).toFixed(1)}° ${c.lat>=0?'N':'S'} / ${Math.abs(c.lon).toFixed(1)}° ${c.lon>=0?'E':'W'}`;
}

export function regionOptions(value: string): string {
  return `<option value="all"${value==='all'?' selected':''}>Celý svět</option>`+Object.entries(Core.REGIONS).map(([key,label])=>`<option value="${key}"${value===key?' selected':''}>${label}</option>`).join('');
}

export function flagImage(code: string, hiddenName = false, extra = ''): string {
  return `<img class="country-flag ${extra}" src="${flags[code]}" alt="${hiddenName?'Vlajka k poznání':'Vlajka: '+esc(byCode[code]!.name)}" draggable="false" decoding="sync">`;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function notify(message: string): void {
  clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},3500);
}

let storageWarningShown = false;

/** `write`, plus the one-shot toast a refusal owes the player. */
export function persist(key: string, value: unknown): boolean {
  const ok=write(key,value);if(!ok&&!storageWarningShown){storageWarningShown=true;notify('Prohlížeč nepovoluje ukládání. Po zavření stránky se postup ztratí.');}return ok;
}
