/**
 * U7 — the computed-style gate over the split stylesheet.
 *
 * The unit moves CSS rules and nothing else, so the only honest way to state
 * that it changed nothing is to let a browser resolve both stylesheets and
 * compare. That is what happens here, and it happens *differentially*: one
 * page, one Chromium, one viewport, one moment, with the `<style>` element's
 * text swapped between `tests/fixtures/baseline/style.css` — frozen, never
 * edited, the pre-split source of truth — and the concatenation of
 * `src/styles/*.css`. Everything the platform contributes cancels out, and what
 * is left is exactly the claim: the split changed nothing.
 *
 * A committed snapshot of absolute values was the alternative and would have
 * been wrong. `width` and `height` come back as *used* values, the interface is
 * set in Georgia and Inter, and R8 forbids shipping a font file — so the same
 * page measures differently on a machine that has those faces and one that does
 * not. Pinning Chromium never pinned the fonts. A differential run has nothing
 * to pin. It is also how the rest of this project works: U5 measured the
 * synthesizer and the globe against the frozen originals, U16 diffed rendered
 * markup against the previous build.
 *
 * Run with `npx playwright test tests/browser/styles.spec.ts`;
 * `npm run test:browser` is still U14's to wire up.
 *
 * What it walks: fifteen screens rather than the default one, because a
 * flattened `!important` that only shows on the results screen would pass any
 * gate that only ever loaded the home page. Eight widths rather than the six
 * the plan named — `max-width:1050px` is never observed alone by those six,
 * since at 840 and below `max-width:840px` is also live and may override it, so
 * 1000 was added, and 1280 with it as the only width at which no width-keyed
 * block is active at all. Then `:hover`, `:focus-visible`, `:active` and
 * `:disabled` forced through the debugger, `::before`/`::after` content, and a
 * `prefers-reduced-motion` pass.
 *
 * Values the page writes into a `style` attribute are recorded as `(inline)`.
 * The countdown bar's `transform` moves every frame and belongs to the clock,
 * not to the stylesheet; measuring it would compare two different instants.
 */
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, STYLE_FILES, readStylesheet, writeReadable } from '../../scripts/build.ts';
import * as Core from '../../src/engine/core.ts';
import type { Country, GameState } from '../../src/engine/types.ts';
import {
  DECLARED_STYLE_CHANGES,
  canonicalDifferences,
  canonicalize,
  duplicatePairs,
  importantDeclarations,
  parseStylesheet,
  ruleKey,
  selectorInventory,
} from '../helpers/css.ts';

/* ------------------------------------------------------------------ *
 * What is measured
 * ------------------------------------------------------------------ */

const BASELINE_CSS = join(REPO_ROOT, 'tests/fixtures/baseline/style.css');

/** The pre-split stylesheet, and the one that replaced it. */
const FROZEN = readFileSync(BASELINE_CSS, 'utf8');
const SPLIT = readStylesheet();

/**
 * Eight widths: the six the plan named, plus 1000 so `max-width:1050px` is seen
 * without `max-width:840px` over it, plus 1280 where no width-keyed block is
 * active — the only width at which a rule wrongly left inside a media block
 * would go missing.
 */
const BREAKPOINTS: readonly number[] = [1450, 1280, 1150, 1000, 840, 700, 390, 360];

/** The width the `prefers-reduced-motion` pass runs at; that block is width-free. */
const REDUCED_MOTION_WIDTH = 1280;

const VIEWPORT_HEIGHT = 900;

/**
 * Every property `src/style.css` declares, resolved to what a computed style
 * actually answers with, plus the twelve custom properties.
 *
 * Shorthands where Chromium serializes one (`margin`, `border-color`, `inset`,
 * `flex`, …) and longhands where it does not. `width` and `height` are used
 * values, which is what makes the list sensitive to layout and not only to
 * declarations — and which is why the two readings have to happen in the same
 * browser seconds apart rather than months apart on two machines.
 */
const PROPERTIES: readonly string[] = [
  'display', 'position', 'inset', 'z-index', 'float',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin', 'padding', 'border-width', 'border-style', 'border-color', 'border-radius',
  'box-sizing', 'overflow', 'visibility', 'opacity',
  'background-color', 'background-image', 'box-shadow',
  'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'line-height',
  'letter-spacing', 'text-align', 'text-transform', 'text-decoration-line',
  'text-underline-offset', 'text-overflow', 'white-space', 'overflow-wrap',
  'vertical-align', 'font-variant-numeric',
  'flex-direction', 'flex-wrap', 'flex', 'align-items', 'align-self',
  'justify-content', 'justify-self', 'gap', 'grid-template-columns', 'grid-column',
  'transform', 'transform-origin', 'transition', 'animation',
  'cursor', 'pointer-events', 'touch-action', 'outline', 'outline-offset',
  'fill', 'stroke', 'stroke-width', 'object-fit', 'filter', 'backdrop-filter',
  'accent-color', 'scroll-behavior', 'scrollbar-color', 'scrollbar-width', 'content',
  '--bg', '--panel', '--panel2', '--ink', '--muted', '--line', '--accent', '--green',
  '--dark', '--serif', '--sans', '--mono',
];

/** The pseudo-elements the stylesheet styles, and the only ones recorded. */
const PSEUDO_ELEMENTS: readonly string[] = ['::before', '::after', '::placeholder', '::backdrop'];

/**
 * The one intended rendering change: `.sound-button` holds `ZVUK`/`TICHO`, and
 * the English `SOUND`/`MUTED` U11 adds would overflow a fixed width. Both
 * `width` declarations become `min-width`, which leaves the desktop button at
 * 76 px — the floor is wider than `.icon-button`'s 39 px — and lets the phone
 * button take `.icon-button`'s 33 px instead of being pinned at 32.
 */
const SOUND_BUTTON_PATH = 'button#sound.icon-button.sound-button';
const SOUND_BUTTON_EXCEPTIONS: readonly { readonly path: string; readonly property: string }[] = [
  { path: SOUND_BUTTON_PATH, property: 'min-width' },
  { path: SOUND_BUTTON_PATH, property: 'width' },
  // `transform-origin` is the centre of the border box, so it follows the one
  // pixel. Below 700 px that pixel also widens the row holding the button, and
  // the diff stops there — nothing else on any screen moves.
  { path: SOUND_BUTTON_PATH, property: 'transform-origin' },
  { path: 'div.header-actions', property: 'width' },
  { path: 'div.header-actions', property: 'transform-origin' },
];

/* ------------------------------------------------------------------ *
 * The saves the screens are driven from
 * ------------------------------------------------------------------ */

const countries = JSON.parse(
  readFileSync(join(REPO_ROOT, 'data/build/countries.json'), 'utf8'),
) as Country[];

const savedRun = (name: string): string =>
  readFileSync(join(REPO_ROOT, `tests/fixtures/baseline/runs/${name}.json`), 'utf8');

/** Fixed, so the duel and the two end screens are the same run on every run. */
const SEED = 20260909;

const DUEL_OPTIONS = { players: 2, names: ['Alice', 'Bob'], difficulty: 'normal' as const, region: 'all' as const };
const SOLO_OPTIONS = { players: 1, names: ['Hráč 1', 'Hráč 2'], difficulty: 'normal' as const, region: 'all' as const };

/** Answer everything wrong until the run reaches `stop`, then hand it back. */
function simulate(players: 1 | 2, stop: (game: GameState) => boolean): GameState {
  const game = Core.makeGame(countries, players === 2 ? DUEL_OPTIONS : SOLO_OPTIONS, SEED);
  for (let guard = 0; guard < 2000; guard += 1) {
    if (stop(game)) {
      // A save always comes back with its clock paused; clearing it instead
      // starts the question fresh, which is the state the screens show.
      game.clock = null;
      game.revealedIndex = game.index;
      return game;
    }
    const question = game.questions[game.index];
    if (question === undefined) break;
    Core.submit(game, (question.correct + 1) % 3, 1000);
    // Not a break: the last answered question is itself a state to stop on.
    if (game.gameOver) continue;
    if (!Core.advance(game, countries)) break;
  }
  throw new Error('the simulated run never reached the state the walk needs');
}

/** The last question answered and no attempts left: one click from the results. */
const playedOut = (players: 1 | 2): GameState =>
  simulate(players, (game) => game.gameOver && Boolean(game.answers[game.index]));

/**
 * A duel stopped on a question whose opponent is already out.
 *
 * That is the only way to see `.score-chip.eliminated`, and the question has to
 * be one that needs no arrival flight, or resuming the save would spend twelve
 * seconds on a globe instead of showing the screen.
 */
const duelEliminated = (): GameState =>
  simulate(2, (game) => {
    const question = game.questions[game.index];
    if (question === undefined || game.answers[game.index] !== undefined) return false;
    return game.lives[(question.player + 1) % 2] === 0 && !Core.needsFlight(game);
  });

/* ------------------------------------------------------------------ *
 * Driving the screens
 * ------------------------------------------------------------------ */

interface Scene {
  readonly name: string;
  readonly setup: (page: Page) => Promise<void>;
}

/** Fifteen screens, eight widths and two stylesheets per width. */
test.setTimeout(300_000);

let out: string;
let pageUrl: string;

test.beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'wg-styles-'));
  const file = join(out, 'index.html');
  await writeReadable(undefined, file);
  pageUrl = pathToFileURL(file).href;
});

test.afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

interface Preload {
  readonly run?: string;
  readonly settings?: Record<string, unknown>;
}

/** Load the page with the synthesizer off and whatever is being resumed in the slot. */
async function open(page: Page, preload: Preload = {}): Promise<void> {
  await page.addInitScript(
    ([run, settings]) => {
      // Authoritative, not additive: one page walks every screen in the
      // overflow test, so each `open` has to undo the last one's save.
      window.localStorage.clear();
      window.localStorage.setItem('wg.audio.v2', JSON.stringify({ enabled: false }));
      if (run !== undefined) window.localStorage.setItem('wg.run.v7', run);
      if (settings !== undefined) window.localStorage.setItem('wg.settings.v1', settings);
    },
    [preload.run, preload.settings === undefined ? undefined : JSON.stringify(preload.settings)],
  );
  await page.setViewportSize({ width: BREAKPOINTS[0]!, height: VIEWPORT_HEIGHT });
  await page.goto(pageUrl);
  await page.waitForSelector('#side-panel');
}

/** Resume a save and land on the paused question it always comes back as. */
async function resume(page: Page, run: string): Promise<void> {
  await open(page, { run });
  await page.locator('#resume').click();
}

const SCENES: readonly Scene[] = [
  { name: 'home', setup: async (page) => { await open(page); } },
  {
    name: 'home-resume',
    setup: async (page) => { await open(page, { run: savedRun('mid-country') }); await page.waitForSelector('#resume'); },
  },
  {
    name: 'home-duel',
    setup: async (page) => { await open(page, { settings: { players: 2 } }); await page.waitForSelector('#p2-name'); },
  },
  {
    name: 'atlas',
    setup: async (page) => { await open(page); await page.locator('#nav-atlas').click(); await page.waitForSelector('.atlas-item.active'); },
  },
  {
    name: 'atlas-no-match',
    setup: async (page) => {
      await open(page);
      await page.locator('#nav-atlas').click();
      await page.locator('#atlas-search').fill('qqqqq');
      await page.waitForSelector('.atlas-list .empty');
    },
  },
  {
    name: 'game-paused',
    setup: async (page) => { await resume(page, savedRun('mid-country')); await page.waitForSelector('#resume-clock'); },
  },
  {
    name: 'game-question',
    setup: async (page) => {
      await resume(page, savedRun('mid-country'));
      await page.locator('#resume-clock').click();
      await page.waitForSelector('#pause-game');
    },
  },
  {
    name: 'game-feedback',
    setup: async (page) => { await resume(page, savedRun('post-milestone')); await page.waitForSelector('#next'); },
  },
  {
    name: 'game-flag-bonus',
    setup: async (page) => {
      await resume(page, savedRun('pending-bonus'));
      await page.locator('#resume-clock').click();
      await page.waitForSelector('body.flag-question .bonus-flag-card');
    },
  },
  {
    name: 'game-flight',
    setup: async (page) => {
      await resume(page, savedRun('mid-flight'));
      await page.waitForSelector('body.flying #flight-status');
      // Freeze the twelve-second arrival on its longest stage. The page pauses
      // a flight when the tab goes away, and a flight that kept turning between
      // the two readings would put a moving globe into the diff.
      await page.waitForFunction(
        () => (window as unknown as { WorldGeography: { getStatus(): { globe: { flight: { stage: string } | null } } } })
          .WorldGeography.getStatus().globe.flight?.stage === 'spin',
        null,
        { timeout: 30_000 },
      );
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    },
  },
  {
    name: 'game-duel',
    setup: async (page) => {
      await resume(page, JSON.stringify(duelEliminated()));
      await page.waitForSelector('.score-chip.eliminated');
    },
  },
  {
    name: 'results',
    setup: async (page) => {
      await resume(page, JSON.stringify(playedOut(1)));
      await page.locator('#next').click();
      await page.waitForSelector('#again');
    },
  },
  {
    name: 'results-duel',
    setup: async (page) => {
      await resume(page, JSON.stringify(playedOut(2)));
      await page.locator('#next').click();
      await page.waitForSelector('.duel-result');
    },
  },
  {
    name: 'dialog-help',
    setup: async (page) => { await open(page); await page.locator('#nav-help').click(); await page.waitForSelector('dialog[open] .help-step'); },
  },
  {
    name: 'dialog-sources',
    setup: async (page) => { await open(page); await page.locator('#data-button').click(); await page.waitForSelector('dialog[open] #export-data'); },
  },
  {
    name: 'dialog-audio',
    setup: async (page) => { await open(page); await page.locator('#sound-options').click(); await page.waitForSelector('dialog[open] #audio-volume'); },
  },
];

/* ------------------------------------------------------------------ *
 * The measurement
 * ------------------------------------------------------------------ */

/** A property map, plus a nested one per pseudo-element that exists. */
type ElementRecord = Record<string, string | Record<string, string>>;

/**
 * Swap what the page's one `<style>` element says.
 *
 * The DOM is untouched: the app has already rendered, and nothing it printed
 * depends on CSS. That is the point — two readings of one document, so the
 * fonts, the Chromium build and the machine are identical on both sides and
 * cancel out of the comparison entirely.
 */
async function useStylesheet(page: Page, css: string): Promise<void> {
  await page.evaluate((text) => {
    const style = document.querySelector('style');
    if (style === null) throw new Error('the built page has no <style> element to swap');
    style.textContent = text;
    // Force the layout the swap implies before anything is measured through a
    // second round trip.
    void document.documentElement.offsetHeight;
  }, css);
}

/**
 * Every rendered element, under a path that names it.
 *
 * Nothing inside a `display:none` subtree is walked: the element carrying the
 * `none` is recorded — which is what `[hidden]` has to be measured on — and
 * what is underneath it is not rendering.
 */
async function readPass(page: Page, properties: readonly string[], pseudoElements: readonly string[]): Promise<Record<string, ElementRecord>> {
  return page.evaluate(
    ([propertyList, pseudoList]) => {
      const segmentOf = (element: Element): string => {
        let name = element.tagName.toLowerCase();
        if (element.id !== '') name += `#${element.id}`;
        const classes = [...element.classList].sort();
        if (classes.length > 0) name += `.${classes.join('.')}`;
        return name;
      };
      const pathOf = (element: Element): string => {
        const parts: string[] = [];
        for (let node: Element | null = element; node !== null && node !== document.documentElement; node = node.parentElement) {
          let part = segmentOf(node);
          const parent: Element | null = node.parentElement;
          if (parent !== null) {
            const twins = [...parent.children].filter((child) => segmentOf(child) === part);
            if (twins.length > 1) part += `:nth(${String(twins.indexOf(node) + 1)})`;
          }
          parts.unshift(part);
        }
        return parts.join('>');
      };

      const rendered: Element[] = [document.body];
      const walk = (parent: Element): void => {
        for (const child of parent.children) {
          if (['script', 'noscript'].includes(child.tagName.toLowerCase())) continue;
          rendered.push(child);
          if (getComputedStyle(child).display === 'none') continue;
          walk(child);
        }
      };
      walk(document.body);

      const readAll = (style: CSSStyleDeclaration): Record<string, string> => {
        const record: Record<string, string> = {};
        for (const property of propertyList) record[property] = style.getPropertyValue(property);
        return record;
      };

      const elements: Record<string, Record<string, string | Record<string, string>>> = {};
      for (const element of rendered) {
        const tag = element.tagName.toLowerCase();
        const style = getComputedStyle(element);
        const own = (element as HTMLElement).style;
        const inline = new Set<string>();
        for (let i = 0; i < own.length; i += 1) inline.add(own.item(i));

        const record: Record<string, string | Record<string, string>> = {};
        for (const property of propertyList) {
          record[property] = inline.has(property) ? '(inline)' : style.getPropertyValue(property);
        }
        for (const pseudo of pseudoList) {
          const generated = getComputedStyle(element, pseudo);
          const content = generated.getPropertyValue('content');
          const real = pseudo === '::placeholder'
            ? ['input', 'textarea'].includes(tag)
            : pseudo === '::backdrop'
              ? tag === 'dialog'
              : content !== '' && content !== 'none';
          if (real) record[pseudo] = readAll(generated);
        }
        elements[pathOf(element)] = record;
      }
      return elements;
    },
    [properties, pseudoElements] as const,
  );
}

/**
 * `:hover`, `:focus-visible`, `:active` and `:disabled`, read off the stylesheet
 * rather than guessed at.
 *
 * Chromium can be told to hold an element in a pseudo-state, which is the only
 * way to measure `:active` on a canvas or `:focus-visible` on four different
 * tags without inventing an input sequence per screen.
 */
interface PseudoTarget {
  readonly selector: string;
  readonly base: string;
  readonly states: readonly string[];
}

function pseudoTargets(css: string): PseudoTarget[] {
  const targets = new Map<string, PseudoTarget>();
  for (const rule of parseStylesheet(css).rules) {
    for (const selector of rule.selectors) {
      // `:not(:disabled)` is a condition on the base element, not a state to
      // force; dropping it whole keeps `.answer:not(:disabled):hover` legal.
      const base = selector.replace(/:not\(\s*:(?:hover|focus-visible|active|disabled)\s*\)/g, '');
      const states = [...base.matchAll(/:(hover|focus-visible|active|disabled)\b/g)].map((match) => match[1]!);
      if (states.length === 0) continue;
      const plain = base.replace(/:(hover|focus-visible|active|disabled)\b/g, '');
      targets.set(selector, { selector, base: plain, states: [...new Set(states)] });
    }
  }
  return [...targets.values()];
}

/**
 * `tag#id.class.class`, the same shape the last segment of an element path
 * takes — so a state difference names the element the same way an ordinary one
 * does, and one declared exception can cover both.
 */
function describe(node: { localName?: string; nodeName: string; attributes?: string[] }): string {
  const attributes = new Map<string, string>();
  const list = node.attributes ?? [];
  for (let i = 0; i + 1 < list.length; i += 2) attributes.set(list[i]!, list[i + 1]!);
  let name = node.localName ?? node.nodeName.toLowerCase();
  const id = attributes.get('id');
  if (id !== undefined && id !== '') name += `#${id}`;
  const classes = (attributes.get('class') ?? '').split(/\s+/).filter((one) => one !== '').sort();
  if (classes.length > 0) name += `.${classes.join('.')}`;
  return name;
}

/** What each forced state resolves to, for the first two elements it matches. */
async function readPseudoStates(cdp: CDPSession, targets: readonly PseudoTarget[]): Promise<Record<string, Record<string, string>>> {
  const wanted = new Set(PROPERTIES);
  const states: Record<string, Record<string, string>> = {};
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });

  for (const target of targets) {
    let matches: number[] = [];
    try {
      ({ nodeIds: matches } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: target.base }));
    } catch {
      throw new Error(`Chromium rejected the base selector ${target.base} derived from ${target.selector}`);
    }
    for (const nodeId of matches.slice(0, 2)) {
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [...target.states] });
      const { computedStyle } = await cdp.send('CSS.getComputedStyleForNode', { nodeId });
      const { node } = await cdp.send('DOM.describeNode', { nodeId });
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
      const record: Record<string, string> = {};
      for (const property of computedStyle) if (wanted.has(property.name)) record[property.name] = property.value;
      states[`${target.selector} on ${describe(node)}`] = record;
    }
  }
  return states;
}

/* ------------------------------------------------------------------ *
 * Comparing
 * ------------------------------------------------------------------ */

/** A difference that names its screen, width, element and property. */
function diffRecords(where: string, before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const differences: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[key];
    const now = after[key];
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    differences.push(`${where} ${key}: ${JSON.stringify(was ?? null)} -> ${JSON.stringify(now ?? null)}`);
  }
  return differences;
}

function diffGroup(where: string, before: Record<string, Record<string, unknown>>, after: Record<string, Record<string, unknown>>): string[] {
  const differences: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[key];
    const now = after[key];
    if (was === undefined) { differences.push(`${where} ${key}: appeared`); continue; }
    if (now === undefined) { differences.push(`${where} ${key}: disappeared`); continue; }
    differences.push(...diffRecords(`${where} ${key}`, was, now));
  }
  return differences;
}

/** True for the one declared exception, and only where it was declared. */
function isDeclaredException(difference: string): boolean {
  return SOUND_BUTTON_EXCEPTIONS.some(({ path, property }) => difference.includes(`${path} ${property}: `));
}

/* ------------------------------------------------------------------ *
 * The screens
 * ------------------------------------------------------------------ */

test.describe('computed styles', () => {
  const targets = pseudoTargets(FROZEN);

  for (const scene of SCENES) {
    test(`${scene.name} resolves the same under both stylesheets, at every width`, async ({ page }) => {
      await scene.setup(page);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');

      // Every screen is reached by clicking, which leaves the pointer somewhere
      // in the header. A resize slides a different button under it and `:hover`
      // would be measured as if it were the resting state.
      await page.mouse.move(0, 0);

      const differences: string[] = [];
      const declared: string[] = [];

      const measure = async (where: string): Promise<void> => {
        await useStylesheet(page, FROZEN);
        const beforeElements = await readPass(page, PROPERTIES, PSEUDO_ELEMENTS);
        const beforeStates = await readPseudoStates(cdp, targets);
        await useStylesheet(page, SPLIT);
        const afterElements = await readPass(page, PROPERTIES, PSEUDO_ELEMENTS);
        const afterStates = await readPseudoStates(cdp, targets);

        for (const difference of [
          ...diffGroup(where, beforeElements, afterElements),
          ...diffGroup(`${where} state`, beforeStates, afterStates),
        ]) {
          if (isDeclaredException(difference)) declared.push(difference);
          else differences.push(difference);
        }
      };

      for (const width of BREAKPOINTS) {
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
        await measure(`${scene.name}|${String(width)}`);
      }

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: REDUCED_MOTION_WIDTH, height: VIEWPORT_HEIGHT });
      await measure(`${scene.name}|${String(REDUCED_MOTION_WIDTH)}|reduced-motion`);
      await page.emulateMedia({ reducedMotion: null });

      expect(differences, differences.slice(0, 40).join('\n')).toEqual([]);
      // The exception has to be real, not merely permitted: the button's floor
      // must actually have moved, on every width the walk touched and once more
      // in the reduced-motion pass. `state` entries are the forced-pseudo
      // readings of the same element and are counted separately.
      const floor = (kind: (difference: string) => boolean): string[] =>
        declared.filter((difference) => difference.includes(`${SOUND_BUTTON_PATH} min-width: `) && kind(difference));
      expect(floor((difference) => !difference.includes(' state '))).toHaveLength(BREAKPOINTS.length + 1);
      expect(floor((difference) => difference.includes(' state '))).toHaveLength(BREAKPOINTS.length + 1);
    });
  }
});

/* ------------------------------------------------------------------ *
 * The stylesheet itself
 * ------------------------------------------------------------------ */

/** Kept whole; see the mobile sheet's own header for why the three, not one. */
const MOBILE_SHEET = 'src/styles/mobile.css';
const PHONE_QUERIES: readonly string[] = [
  '@media(max-width:700px)', '@media(max-width:390px)', '@media(max-width:360px)',
];

const baselineSheet = () => parseStylesheet(FROZEN);
const componentSheets = () =>
  STYLE_FILES.map((relative) => ({ file: relative, css: readFileSync(join(REPO_ROOT, relative), 'utf8') }));

test.describe('the split stylesheet', () => {
  test('has no src/style.css left to include twice', () => {
    expect(existsSync(join(REPO_ROOT, 'src/style.css'))).toBe(false);
    for (const relative of STYLE_FILES) expect(existsSync(join(REPO_ROOT, relative))).toBe(true);
  });

  test('gives every selector of the original exactly one component file', () => {
    // The mobile sheet is the declared exception, and it has to be: it is kept
    // whole, so a selector with both a base rule and a phone override is named
    // in its component *and* there. That is a breakpoint override, not a second
    // home — every selector mobile.css names is one a component already owns.
    const owners = new Map<string, string[]>();
    for (const { file, css } of componentSheets()) {
      if (file === MOBILE_SHEET) continue;
      for (const selector of selectorInventory(parseStylesheet(css))) {
        const seen = owners.get(selector);
        if (seen === undefined) owners.set(selector, [file]);
        else if (!seen.includes(file)) seen.push(file);
      }
    }
    const original = selectorInventory(baselineSheet());
    const mobile = selectorInventory(parseStylesheet(readFileSync(join(REPO_ROOT, MOBILE_SHEET), 'utf8')));
    const known = new Set([...owners.keys(), ...mobile]);

    const missing = original.filter((selector) => !known.has(selector));
    const shared = [...owners.entries()].filter(([, files]) => files.length > 1);
    const invented = [...known].filter((selector) => !original.includes(selector));

    expect(missing, `selectors lost in the split: ${missing.join(', ')}`).toEqual([]);
    expect(invented, `selectors the original never had: ${invented.join(', ')}`).toEqual([]);
    expect(
      shared.map(([selector, files]) => `${selector} -> ${files.join(', ')}`),
      'a selector may live in exactly one component file',
    ).toEqual([]);
  });

  test('parses, and holds each selector-and-media pair once', () => {
    const sheet = parseStylesheet(SPLIT);
    expect(sheet.rules.length).toBeGreaterThan(0);
    expect(duplicatePairs(sheet)).toEqual([]);
  });

  test('resolves every selector to what the original resolved it to', () => {
    const differences = canonicalDifferences(baselineSheet(), parseStylesheet(SPLIT));
    // Spelled out rather than filtered by pattern; `DECLARED_STYLE_CHANGES`
    // carries the reason for each of the five.
    expect(differences).toEqual([...DECLARED_STYLE_CHANGES]);
  });

  test('keeps all ten !important declarations, each still winning', () => {
    const before = importantDeclarations(baselineSheet());
    const after = importantDeclarations(parseStylesheet(SPLIT));

    // Ten as written, nine distinct: `[hidden]{display:none!important}` was
    // spelled twice, identically, in two historical layers. The flatten keeps
    // one, and that is the only number that moves.
    expect(before).toHaveLength(10);
    expect(new Set(before).size).toBe(9);
    expect(new Set(after)).toEqual(new Set(before));

    // Still `!important`, and still the declaration that wins for its property:
    // `canonicalize` folds every occurrence of the selector together the way the
    // cascade would, so a normal declaration that had overtaken one of these
    // would show up here as a lost flag.
    const resolved = canonicalize(parseStylesheet(SPLIT));
    for (const entry of new Set(before)) {
      const at = entry.lastIndexOf('||');
      const [media, prelude] = entry.slice(0, at).split('||');
      const property = entry.slice(at + 2);
      for (const selector of prelude!.split(',')) {
        const declaration = resolved.get(ruleKey(media === '' ? null : media!, selector))?.get(property);
        expect(declaration?.important, `${media ?? ''} ${selector} ${property} stopped winning`).toBe(true);
      }
    }
  });

  test('keeps the keyframes it had, by name and by duration', () => {
    expect(parseStylesheet(SPLIT).keyframes).toEqual(baselineSheet().keyframes);

    const durations = (css: string): string[] =>
      parseStylesheet(css).rules
        .flatMap((rule) =>
          rule.declarations
            .filter((declaration) => declaration.property === 'animation')
            .flatMap((declaration) =>
              rule.selectors.map((selector) => `${selector} { animation: ${declaration.value} }`),
            ),
        )
        .sort();
    expect(durations(SPLIT)).toEqual(durations(FROZEN));
  });

  test('starts with the tokens every other file reads', () => {
    expect(STYLE_FILES[0]).toBe('src/styles/tokens.css');
    expect(STYLE_FILES.at(-1)).toBe(MOBILE_SHEET);
    const tokens = parseStylesheet(readFileSync(join(REPO_ROOT, STYLE_FILES[0]!), 'utf8'));
    expect(tokens.rules.map((rule) => rule.prelude)).toEqual([':root']);
  });

  test('keeps the mobile sheet whole', () => {
    // The 700 px sheet is a layout override rather than a component's own
    // breakpoint, so it is the one media block that does not follow its rules
    // into their component files. The 390 and 360 blocks come with it because
    // they refine it and carry no extra specificity: left in a component file,
    // every one of which loads earlier, they would land *before* the rules they
    // exist to override.
    for (const { file, css } of componentSheets()) {
      if (file === MOBILE_SHEET) continue;
      const queries = new Set(parseStylesheet(css).mediaQueries);
      for (const query of PHONE_QUERIES) {
        expect([...queries], `${file} holds part of the mobile sheet`).not.toContain(query);
      }
    }
    const mobile = parseStylesheet(readFileSync(join(REPO_ROOT, MOBILE_SHEET), 'utf8'));
    expect([...new Set(mobile.mediaQueries)]).toEqual([...PHONE_QUERIES]);
  });
});

/* ------------------------------------------------------------------ *
 * The claims a diff cannot make
 * ------------------------------------------------------------------ */

test.describe('rendering claims', () => {
  test('never scrolls sideways on a phone', async ({ page }) => {
    const overflowing: string[] = [];
    for (const scene of SCENES) {
      await scene.setup(page);
      for (const width of [390, 360]) {
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
        const box = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        if (box.scrollWidth > box.clientWidth) {
          overflowing.push(`${scene.name}@${String(width)}: ${String(box.scrollWidth)} > ${String(box.clientWidth)}`);
        }
      }
    }
    expect(overflowing).toEqual([]);
  });

  test('fits the English sound labels without clipping', async ({ page }) => {
    await SCENES[0]!.setup(page);
    for (const width of BREAKPOINTS) {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      for (const label of ['SOUND', 'MUTED']) {
        const fit = await page.evaluate((text) => {
          const button = document.getElementById('sound')!;
          const span = button.querySelector('.sound-label')!;
          const was = span.textContent;
          span.textContent = text;
          const measured = {
            scrollWidth: button.scrollWidth,
            clientWidth: button.clientWidth,
            minWidth: getComputedStyle(button).minWidth,
            hidden: getComputedStyle(span).display === 'none',
          };
          span.textContent = was;
          return measured;
        }, label);
        // Below 700 px the label is hidden and the glyph is all there is.
        if (fit.hidden) continue;
        // A floor rather than a fixed width is what lets the button grow, and
        // it is the only reason this holds for a word longer than `ZVUK`.
        expect(fit.minWidth, `no floor at ${String(width)} px`).toBe('76px');
        expect(fit.scrollWidth, `${label} clips at ${String(width)} px`).toBeLessThanOrEqual(fit.clientWidth);
      }
    }
  });

  test('still turns transitions and animations off for reduced motion', async ({ page }) => {
    await SCENES[0]!.setup(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const measured = await page.evaluate(() => {
      const button = document.getElementById('sound')!;
      return {
        transition: getComputedStyle(button).transitionDuration,
        animation: getComputedStyle(button).animationName,
        scroll: getComputedStyle(document.documentElement).scrollBehavior,
      };
    });
    await page.emulateMedia({ reducedMotion: null });
    expect(measured.transition).toBe('0s');
    expect(measured.animation).toBe('none');
    expect(measured.scroll).toBe('auto');
  });

  test('keeps [hidden] winning over the display a component gives it', async ({ page }) => {
    await SCENES[0]!.setup(page);
    await page.setViewportSize({ width: 390, height: VIEWPORT_HEIGHT });
    const hidden = await page.evaluate(() => {
      const hud = document.getElementById('mobile-hud')!;
      return { attribute: hud.hasAttribute('hidden'), display: getComputedStyle(hud).display };
    });
    // `.mobile-hud` is `display:flex` below 700 px; only the `!important` on
    // `[hidden]` keeps the strip off the screen outside a live question.
    expect(hidden.attribute).toBe(true);
    expect(hidden.display).toBe('none');
  });

  test('keeps the two !important widths on the mixer button', async ({ page }) => {
    await SCENES[0]!.setup(page);
    for (const [width, expectedWidth] of [[1280, '32px'], [700, '25px'], [390, '21px'], [360, '21px']] as const) {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      const measured = await page.evaluate(() => getComputedStyle(document.getElementById('sound-options')!).width);
      // `.icon-button` sets 33 px below 700 and now lives in a file that loads
      // after the button's own rule; the `!important` is what still wins.
      expect(measured, `mixer button at ${String(width)} px`).toBe(expectedWidth);
    }
  });

  test('keeps the disabled controls the game disables', async ({ page }) => {
    await SCENES.find((scene) => scene.name === 'game-flight')!.setup(page);
    const flight = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('.globe-controls button')!;
      return { disabled: button.disabled, cursor: getComputedStyle(button).cursor };
    });
    expect(flight.disabled).toBe(true);
    expect(flight.cursor).toBe('default');

    await SCENES.find((scene) => scene.name === 'game-feedback')!.setup(page);
    const answered = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-answer="0"]')!;
      return { disabled: button.disabled, cursor: getComputedStyle(button).cursor };
    });
    expect(answered.disabled).toBe(true);
    expect(answered.cursor).toBe('default');
  });
});
