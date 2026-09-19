/**
 * U14 — `browser.test.py`'s gameplay groups, in both languages.
 *
 * The rules this file checks are the ones a player would notice and nobody
 * would catch by reading: a country is charged once however many questions it
 * takes, five wrong answers are free, ten thousand points buy two attempts now
 * and a flag later, a flag bonus is not charged at all, and a duel keeps two
 * ledgers rather than one. `tests/unit/core.test.ts` proves the engine
 * implements them; what only a browser can say is that the screen a player
 * clicks on implements them too — the ledger is drawn from `AnswerResult`
 * fields that a view is free to read wrongly.
 *
 * **Both languages, and against the catalog.** v7's suite asserted Czech
 * literals: `'AŽ 1 000 BODŮ' in .setup-bottom`. That is two tests fused into
 * one — a rule, and a string — and the string half fails whenever someone
 * improves the copy. Here the expected text is resolved from `src/i18n/` at
 * the same key the view resolves it from, so a copy edit moves both sides and
 * a *missing* or *mistranslated* key still fails. Running the whole thing
 * twice is what makes the English shell more than a screenshot: every ledger
 * rule is exercised against an English run, whose questions were baked from
 * the English bundle.
 *
 * The runs are resumed from fixtures with `revealedIndex` already set, so the
 * twelve-second arrival is paid only by the tests that are *about* the
 * arrival. Those are at the bottom, in Czech only: the choreography has no
 * language, and its labels are `i18n.spec.ts`'s to check.
 */
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { REPO_ROOT } from '../../scripts/build.ts';
import { DIST_DIR } from '../../scripts/obfuscate.ts';
import * as Core from '../../src/engine/core.ts';
import { LOCALES } from '../../src/i18n/locales.ts';
import { setLocale, t } from '../../src/i18n/index.ts';
import type { Locale } from '../../src/engine/types.ts';
import { serveDirectory, type StaticSite } from '../helpers/static-server.ts';
import { answerWith, next, openGame, question, ready, state, status, view } from '../helpers/play.ts';
import {
  BUNDLES,
  duel,
  beforeMilestone,
  lastAffordableCountry,
  onFlagBonus,
  startOfCountry,
} from '../helpers/run-fixtures.ts';
import '../helpers/page-api.ts';

test.setTimeout(240_000);

let site: StaticSite;

test.beforeAll(async () => {
  site = await serveDirectory(join(REPO_ROOT, DIST_DIR));
});

test.afterAll(async () => {
  await site.close();
});

/** A catalog string as it reads on screen: several of them carry `<b>` tags. */
const plain = (html: string): string => html.replace(/<[^>]+>/g, '');

/** Resolve a key in one language without leaving the module's locale moved. */
function label(lang: Locale, key: Parameters<typeof t>[0], values?: Parameters<typeof t>[1]): string {
  setLocale(lang);
  try {
    return plain(values === undefined ? t(key) : t(key, values));
  } finally {
    setLocale('cs');
  }
}

/** Every `.answer-text` currently rendered. */
const answerTexts = (page: Page): Promise<string[]> =>
  page.locator('.answer-list .answer-text').allTextContents();

for (const lang of LOCALES) {
  test.describe(`the ledger, in ${lang}`, () => {
    test('charges a country once, however the five questions go', async ({ page }) => {
      await openGame(page, site.url, { run: startOfCountry({ lang }), lang });

      const opening = await state(page);
      const attempts = opening!.lives[0]!;
      const country = (await question(page)).country;
      expect(attempts).toBeGreaterThan(0);

      const melodies: { index: number; startStep: number }[] = [];
      for (const category of Core.TYPES) {
        const current = await ready(page);
        const asked = await question(page);

        // Same country, five categories, in order, with no arrival between
        // them: the transitions inside a country are immediate.
        expect(asked.type).toBe(category);
        expect(asked.country).toBe(country);
        expect(current.globe.flight).toBeNull();

        // Each question draws a different theme and a different entry point
        // into it, which is what stops five questions sounding like one.
        melodies.push({ index: current.audio.melody.index, startStep: current.audio.melody.startStep });

        if (category === 'currency') {
          // Monetary-unit families, not `Name (CODE)` and not an ISO code: the
          // options have to be values from the bundle's own unit table, or the
          // question has more than one defensible answer.
          const units = new Set(Object.values(BUNDLES[lang].currencyUnits));
          for (const text of await answerTexts(page)) expect(units).toContain(text);
        }

        const answer = await answerWith(page, false);
        expect(answer.lifeDelta).toBe(0);
        expect((await state(page))!.lives[0]).toBe(attempts);

        if (category !== 'population') {
          await next(page);
          expect((await status(page)).phase).toBe('question');
        }
      }

      // Two claims, kept apart. A single theme entered at five different bars
      // would satisfy a check on the pairs and still be five questions to the
      // same tune, which is the thing `prepareTheme`'s bag exists to prevent.
      expect(new Set(melodies.map((m) => m.index)).size, `five distinct themes, got ${JSON.stringify(melodies)}`).toBe(5);
      for (const [i, melody] of melodies.slice(1).entries()) {
        expect(melody.startStep, `question ${String(i + 2)} repeats the previous offset`)
          .not.toBe(melodies[i]!.startStep);
      }
      await expect(page.locator('#next')).toContainText(label(lang, 'next.country'));

      // And the charge lands once, on the way to the *next* country.
      await next(page);
      expect((await state(page))!.lives[0]).toBe(attempts - 1);
      expect((await status(page)).phase).toBe('flying');
    });

    test('grants two attempts at ten thousand points and holds the flag back', async ({ page }) => {
      await openGame(page, site.url, { run: beforeMilestone({ lang }), lang });
      await ready(page);

      const before = await state(page);
      const answer = await answerWith(page, true);

      expect(answer.scoreLifeDelta).toBe(Core.MILESTONE_LIVES);
      expect(answer.flagLifeDelta).toBe(0);
      const after = await state(page);
      expect(after!.lives[0]).toBe(before!.lives[0]! + Core.MILESTONE_LIVES);
      expect(after!.pendingBonuses[0]).toEqual([Core.BONUS_INTERVAL]);

      // Both halves are announced: the two attempts now, and the flag later.
      await expect(page.locator('.life-feedback')).toContainText(label(lang, 'life.milestoneNextCountry'));
      await expect(page.locator('#bonus-progress')).toHaveText(label(lang, 'head.bonusWaiting'));

      // The flag waits for every category this country still owes.
      for (const category of ['language', 'population'] as const) {
        await next(page);
        expect((await question(page)).type).toBe(category);
        await ready(page);
        await answerWith(page, false);
      }

      await expect(page.locator('#next')).toContainText(label(lang, 'next.bonus'));
    });

    test('gives the flag bonus away free, and pays for a correct one', async ({ page }) => {
      await openGame(page, site.url, { run: onFlagBonus({ lang }), lang });

      const bonus = await question(page);
      expect(bonus.type).toBe('flag');
      // A bonus turn carries no `countryCost`: it is a gift, not a visit.
      expect(bonus.countryCost).toBeUndefined();
      await expect(page.locator('.bonus-reward')).toHaveText(label(lang, 'bonus.reward'));
      await expect(page.locator('#bonus-progress')).toHaveText(label(lang, 'head.bonusNow'));

      const before = await state(page);
      await ready(page);
      const answer = await answerWith(page, true);

      expect(answer.flagLifeDelta).toBe(1);
      expect(answer.basePoints).toBe(Core.BASE_POINTS);
      expect(answer.points).toBeGreaterThanOrEqual(Core.BASE_POINTS);
      expect(answer.points).toBeLessThanOrEqual(Core.MAX_POINTS);

      const after = await state(page);
      expect(after!.lives[0]).toBe(before!.lives[0]! + 1);
      expect(after!.scores[0]).toBe(before!.scores[0]! + answer.points);
      await expect(page.locator('.life-feedback')).toContainText(label(lang, 'life.flagEarned'));
    });

    test('finishes the last country it paid for, then ends the run', async ({ page }) => {
      await openGame(page, site.url, { run: lastAffordableCountry({ lang }), lang });

      const opening = await state(page);
      expect(opening!.lives[0]).toBe(0);
      await ready(page);
      // Nought attempts left and the country already paid for, which the screen
      // says rather than showing a bare zero.
      await expect(page.locator('.score-lives')).toContainText(label(lang, 'game.livesPaidFor'));

      for (let i = 0; i < Core.TYPES.length; i += 1) {
        await ready(page);
        const answer = await answerWith(page, false);
        expect(answer.lifeDelta).toBe(0);
        if (i < Core.TYPES.length - 1) {
          await next(page);
          expect((await status(page)).phase).toBe('question');
        }
      }

      const finished = await state(page);
      expect(finished!.gameOver).toBe(true);
      await expect(page.locator('#next')).toContainText(label(lang, 'next.results'));

      await next(page);
      expect(await view(page)).toBe('results');
      await expect(page.locator('#results-view')).toBeVisible();

      // The untimed replay is still offered, and it has no clock at all: the
      // readout says so, and `remaining()` agrees, because a review clock is
      // built with a limit of zero rather than with a very large one.
      await page.locator('#review').click();
      const review = await ready(page);
      expect((await state(page))!.review).toBe(true);
      expect(review.clock!.remainingMs).toBe(Infinity);
      await expect(page.locator('[data-time-readout]').first()).toHaveText('∞');
    });

    test('keeps two ledgers in a duel, and hands the turn over after the bonus', async ({ page }) => {
      await openGame(page, site.url, { run: duel({ lang }), lang });

      const opening = await question(page);
      expect(opening.player).toBe(0);
      expect(opening.type).toBe('flag');

      const before = await state(page);
      // The bonus belongs to the player who earned it, and only to them.
      expect(before!.pendingBonuses[1]).toEqual([]);
      expect(before!.bonusIssued[1]).toBe(0);
      expect(before!.scores[1]).toBe(0);

      await ready(page);
      await answerWith(page, false);
      await expect(page.locator('#next')).toContainText(label(lang, 'next.handOver'));
      await next(page);

      const handed = await question(page);
      expect(handed.player).toBe(1);
      const after = await state(page);
      // The second player pays their own entry cost, out of their own reserve,
      // and the first player's attempts are untouched by it.
      expect(after!.lives[0]).toBe(before!.lives[0]);
      expect(after!.lives[1]).toBe(before!.lives[1]! - 1);
      expect(after!.scores[1]).toBe(0);
      await expect(page.locator('.score-chip.active')).toContainText(before!.options.names[1]!);
    });
  });
}

/**
 * The three claims about time: the arrival, the countdown, and a save taken
 * across both.
 *
 * Czech only, and deliberately: what is being checked here is timing and the
 * ledger, neither of which has a language. The flight's own labels are
 * `i18n.spec.ts`'s, which reads them in both.
 */
test.describe('the clock and the arrival', () => {
  test('restores a bonus saved mid-flight without charging for it twice', async ({ page }) => {
    await openGame(page, site.url, { run: onFlagBonus({ revealed: false }) });

    expect((await status(page)).phase).toBe('flying');
    const before = await state(page);
    // A save written part-way through the choreography, which is what the
    // `pagehide` handler writes when a player closes the tab during one.
    await page.clock.runFor(2000);
    const midFlight = await page.evaluate(() => window.localStorage.getItem('wg.run.v7'));

    await openGame(page, site.url, { run: JSON.parse(midFlight ?? 'null') as never });
    expect((await status(page)).phase).toBe('flying');
    // Not one attempt lighter for having been saved and reopened: the bonus
    // was never charged, so restoring it cannot charge for it either.
    expect((await state(page))!.lives).toEqual(before!.lives);

    await ready(page);
    expect((await question(page)).type).toBe('flag');
  });

  test('takes no attempt for a question the player ran out of time on', async ({ page }) => {
    // Resumed on the question rather than flown to it: twenty seconds of
    // countdown is the subject here, and twelve of arrival before it is not.
    await openGame(page, site.url, { run: onFlagBonus() });
    await ready(page);

    const before = await state(page);
    // Past the `normal` limit with the clock running and no answer given.
    await page.clock.runFor(Core.TIME_LIMITS.normal + 1000);

    expect((await status(page)).phase).toBe('feedback');
    const timedOut = (await state(page))!.answers.at(-1)!;
    expect(timedOut.timedOut).toBe(true);
    expect(timedOut.selected).toBeNull();
    expect(timedOut.lifeDelta).toBe(0);
    await expect(page.locator('.life-feedback')).toContainText(plain(t('life.bonusMissed')));

    // The next country is charged once, and the milestone that produced this
    // bonus does not produce a second one.
    await next(page);
    const after = await state(page);
    expect(after!.bonusIssued[0]).toBe(before!.bonusIssued[0]);
    expect(after!.lives[0]).toBe(before!.lives[0]! - 1);
    expect((await question(page)).type).toBe('country');
  });

  test('blocks the question clock for the whole flight, then starts it', async ({ page }) => {
    await openGame(page, site.url, { run: startOfCountry({ revealed: false }) });

    expect((await status(page)).phase).toBe('flying');

    // No clock and no answers while the globe is turning: a player cannot lose
    // time to an animation they did not ask for.
    let at = 0;
    for (const checkpoint of [0, 4000, 8000, 11_000]) {
      if (checkpoint > at) { await page.clock.runFor(checkpoint - at); at = checkpoint; }
      const during = await status(page);
      expect(during.phase, `at ${String(checkpoint)} ms`).toBe('flying');
      expect(during.clock, `at ${String(checkpoint)} ms`).toBeNull();
      expect(await page.locator('[data-answer]').count(), `at ${String(checkpoint)} ms`).toBe(0);
    }
    expect((await status(page)).globe.flight?.turnsCompleted).toBe(3);

    // Run out the last second of the arrival and no more, so what the clock
    // reports is what it has counted since the question appeared. `ready` would
    // advance a further twelve seconds and answer a different question.
    await page.clock.runFor(1300);
    const started = await status(page);
    expect(started.phase).toBe('question');
    expect(started.clock!.running).toBe(true);
    // The countdown starts from the top rather than from wherever the arrival
    // left it: the twelve seconds were the game's, not the player's.
    expect(started.clock!.elapsedMs).toBeLessThan(800);
    expect(started.clock!.remainingMs).toBeGreaterThan(Core.TIME_LIMITS.normal - 800);
  });
});
