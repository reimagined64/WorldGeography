/**
 * The phone-only timer strip.
 *
 * It is a second readout of the same clock the side panel already shows, which
 * is why it carries no state of its own: `tickClock` writes into both through
 * the `data-time-readout` and `data-points-readout` attributes, so the two
 * can never drift apart.
 */
import * as Core from '../engine/core.ts';
import type { AnswerResult } from '../engine/types.ts';
import { store } from './state.ts';

export interface MobileHudHost {
  /** `document.getElementById`, as the shell already wraps it. */
  $(id: string): HTMLElement;
  seconds(ms: number): string;
  pointText(n: number): string;
  /** The pause button is the strip's only control. */
  onPause(): void;
}

/** Called only with a game on screen; `answer` present means feedback, which hides it. */
export function renderMobileHud(host: MobileHudHost, answer: AnswerResult | undefined): void {
  const { $, seconds, pointText } = host;
  const game=store.game!,clock=store.clock!;
  const limit=Core.timeLimit(game),q=game.questions[game.index]!;$('mobile-hud').hidden=!!answer||store.phase!=='question';
  if($('mobile-hud').hidden)return;
  $('mobile-hud').innerHTML=`<div><span>ZBÝVÁ</span><strong><b data-time-readout>${limit?seconds(clock.remaining()):'∞'}</b>${limit?' s':''}</strong></div><div><span>ODMĚNA</span><strong><b data-points-readout>${pointText(Core.pointsForTime(clock.elapsed(),limit))}</b> b.</strong></div>${game.review?'':`<div class="mobile-lives"><span>POKUSY</span><strong>${game.lives[q.player]}${q.type==='flag'?' / +1':''}</strong></div>`}<button id="mobile-pause" class="pause-button" aria-label="Pozastavit otázku">Ⅱ</button>`;
  $('mobile-pause').onclick=()=>{host.onPause();};
}
