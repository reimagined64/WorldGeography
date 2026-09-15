/**
 * The rules dialog: one block of prose, and nothing else.
 *
 * It reads no state and writes none, which is exactly why it was the first
 * thing out of the monolith — the text is a third of a screen of prose that had
 * no business sitting between two render functions. Since U11 the text is not
 * here either: the dialog is the shape, `src/i18n/` is the words, and the two
 * languages cannot drift apart because the compiler checks that both catalogs
 * answer every key this file asks for.
 */
import { t } from '../../i18n/index.ts';

/** One numbered rule, with the strong lead-in the layout expects. */
const step = (number: string, title: string, body: string): string =>
  `<div class="help-step"><span>${number}</span><div><strong>${title}</strong><p>${body}</p></div></div>`;

const section = (title: string, body: string): string => `<h3>${title}</h3><p>${body}</p>`;

export function showHelp(openDialog: (html: string) => void): void {
  openDialog(`<h2 id="dialog-title">${t('help.title')}</h2>
${step('01', t('help.step1Title'), t('help.step1'))}
${step('02', t('help.step2Title'), t('help.step2'))}
${step('03', t('help.step3Title'), t('help.step3'))}
${section(t('help.scoringTitle'), t('help.scoring'))}
${section(t('help.endTitle'), t('help.end'))}
${section(t('help.duelTitle'), t('help.duel'))}
${section(t('help.currencyTitle'), t('help.currency'))}
${section(t('help.musicTitle'), t('help.music'))}
${section(t('help.controlsTitle'), t('help.controls'))}
<p>${t('help.footer')}</p>`);
}
