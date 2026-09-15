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
import { $, esc, pointText, seconds } from './dom.ts';
import { t } from '../i18n/index.ts';
import { pauseQuestion } from './views/game.ts';

/** Called only with a game on screen; `answer` present means feedback, which hides it. */
export function renderMobileHud(answer: AnswerResult | undefined): void {
  const game=store.game!,clock=store.clock!;
  const limit=Core.timeLimit(game),q=game.questions[game.index]!;$('mobile-hud').hidden=!!answer||store.phase!=='question';
  if($('mobile-hud').hidden)return;
  $('mobile-hud').innerHTML=`<div><span>${t('hud.left')}</span><strong><b data-time-readout>${limit?seconds(clock.remaining()):'∞'}</b>${limit?' s':''}</strong></div><div><span>${t('hud.reward')}</span><strong><b data-points-readout>${pointText(Core.pointsForTime(clock.elapsed(),limit))}</b> ${t('hud.points')}</strong></div>${game.review?'':`<div class="mobile-lives"><span>${t('hud.lives')}</span><strong>${game.lives[q.player]}${q.type==='flag'?' / +1':''}</strong></div>`}<button id="mobile-pause" class="pause-button" aria-label="${esc(t('timer.pauseLabel'))}">Ⅱ</button>`;
  $('mobile-pause').onclick=()=>{pauseQuestion();};
}
