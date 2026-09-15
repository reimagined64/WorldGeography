/**
 * A stylesheet reader small enough to trust, for the two claims U7 has to make
 * about the split sheet: that every selector the monolith declared still exists
 * exactly once per component file, and that what each selector resolves to did
 * not move.
 *
 * It is a tokenizer rather than a parser: this project's CSS has no strings
 * containing braces, no `@supports`, no nested rules and comments only between
 * rules, so counting braces is enough and a dependency would buy nothing. It is
 * deliberately not tolerant — an input it cannot make sense of throws, because
 * the one caller feeds it files this repository wrote.
 *
 * `canonicalize` is the equivalence the flatten is measured against. It keys on
 * the *individual* selector rather than the selector list, so regrouping
 * `button,input,select` is invisible to it, and it resolves each property to
 * the declaration that wins — which is what "the same selector still styles the
 * same thing" means once six occurrences have been merged into one.
 */

/** One declaration, with `!important` split out so it can be compared. */
export interface Declaration {
  readonly property: string;
  readonly value: string;
  readonly important: boolean;
}

/** One style rule, flattened out of whatever media block contained it. */
export interface StyleRule {
  /** The `@media(...)` prelude, whitespace-stripped, or `null` at top level. */
  readonly media: string | null;
  /** The selector list as written. */
  readonly prelude: string;
  /** The prelude split on top-level commas. */
  readonly selectors: readonly string[];
  readonly declarations: readonly Declaration[];
  /** Position in the source, so ordering questions can be asked. */
  readonly order: number;
}

/** One `@keyframes`, kept whole: only its name and its text are ever compared. */
export interface KeyframesRule {
  readonly name: string;
  readonly body: string;
}

export interface Stylesheet {
  readonly rules: readonly StyleRule[];
  readonly keyframes: readonly KeyframesRule[];
  /** Every `@media` prelude the sheet contains, in first-seen order. */
  readonly mediaQueries: readonly string[];
}

/** Split on commas that are not inside `(...)` or `[...]`. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

export function parseDeclarations(body: string): Declaration[] {
  return splitTopLevel(body, ';').map((text) => {
    const at = text.indexOf(':');
    if (at === -1) throw new Error(`Declaration without a colon: ${JSON.stringify(text)}`);
    const property = text.slice(0, at).trim();
    let value = text.slice(at + 1).trim();
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/!\s*important$/i, '').trim();
    return { property, value, important };
  });
}

/** Collapse the whitespace a selector may carry without changing what it selects. */
export function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, ' ').trim();
}

export function parseStylesheet(css: string): Stylesheet {
  const rules: StyleRule[] = [];
  const keyframes: KeyframesRule[] = [];
  const mediaQueries: string[] = [];
  let at = 0;

  const skip = (): void => {
    for (;;) {
      while (at < css.length && /\s/.test(css.charAt(at))) at += 1;
      if (css.startsWith('/*', at)) {
        const end = css.indexOf('*/', at + 2);
        if (end === -1) throw new Error('Unterminated comment');
        at = end + 2;
        continue;
      }
      return;
    }
  };

  /** Index just past the `}` that closes the block opening at `open`. */
  const closeOf = (open: number): number => {
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      const ch = css.charAt(i);
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    throw new Error(`Unclosed block opening at offset ${String(open)}`);
  };

  const readRules = (from: number, to: number, media: string | null): void => {
    const outer = at;
    at = from;
    while (at < to) {
      skip();
      if (at >= to) break;
      const open = css.indexOf('{', at);
      if (open === -1 || open >= to) throw new Error(`Rule without a body at offset ${String(at)}`);
      const prelude = css.slice(at, open).trim();
      const close = closeOf(open);
      const body = css.slice(open + 1, close);

      if (prelude.startsWith('@media')) {
        const query = prelude.replace(/\s+/g, '');
        if (media !== null) throw new Error(`Nested media query: ${query}`);
        if (!mediaQueries.includes(query)) mediaQueries.push(query);
        readRules(open + 1, close, query);
      } else if (prelude.startsWith('@keyframes')) {
        keyframes.push({ name: prelude.slice('@keyframes'.length).trim(), body: body.replace(/\s+/g, ' ').trim() });
      } else if (prelude.startsWith('@')) {
        throw new Error(`Unsupported at-rule: ${prelude}`);
      } else {
        rules.push({
          media,
          prelude: normalizeSelector(prelude),
          selectors: splitTopLevel(prelude, ',').map(normalizeSelector),
          declarations: parseDeclarations(body),
          order: rules.length,
        });
      }
      at = close + 1;
    }
    at = outer;
  };

  readRules(0, css.length, null);
  return { rules, keyframes, mediaQueries };
}

/** `@media` prelude and selector, joined into the key both halves of U7 use. */
export function ruleKey(media: string | null, selector: string): string {
  return `${media ?? ''}||${selector}`;
}

/**
 * What each selector resolves to, once every occurrence of it has been folded
 * together the way the cascade would fold them.
 *
 * Later declarations replace earlier ones for the same property, and an
 * `!important` one is never replaced by a normal one — which is the whole
 * reason the ten `!important` declarations have to be looked at individually.
 * The result is order-insensitive on purpose: merging six rules into one moves
 * declarations past each other, and only their outcome is the contract.
 */
export function canonicalize(sheet: Stylesheet): Map<string, Map<string, Declaration>> {
  const resolved = new Map<string, Map<string, Declaration>>();
  for (const rule of sheet.rules) {
    for (const selector of rule.selectors) {
      const key = ruleKey(rule.media, selector);
      let properties = resolved.get(key);
      if (properties === undefined) {
        properties = new Map<string, Declaration>();
        resolved.set(key, properties);
      }
      for (const declaration of rule.declarations) {
        const previous = properties.get(declaration.property);
        if (previous?.important === true && !declaration.important) continue;
        properties.set(declaration.property, declaration);
      }
    }
  }
  return resolved;
}

/**
 * Every property whose resolved declaration differs between two sheets, as
 * `media||selector property: before -> after`.
 *
 * Both halves of U7 ask this question — `tests/unit/scaffold.test.ts` cheaply
 * on every save, `tests/browser/styles.spec.ts` beside the rendering gate — and
 * the answer has to be the same sentence in both places.
 */
export function canonicalDifferences(before: Stylesheet, after: Stylesheet): string[] {
  const show = (declaration: Declaration | undefined): string =>
    declaration === undefined ? 'absent' : `${declaration.value}${declaration.important ? ' !important' : ''}`;
  const was = canonicalize(before);
  const now = canonicalize(after);
  const differences: string[] = [];
  for (const key of new Set([...was.keys(), ...now.keys()])) {
    const left = was.get(key) ?? new Map<string, Declaration>();
    const right = now.get(key) ?? new Map<string, Declaration>();
    for (const property of new Set([...left.keys(), ...right.keys()])) {
      if (show(left.get(property)) === show(right.get(property))) continue;
      differences.push(`${key} ${property}: ${show(left.get(property))} -> ${show(right.get(property))}`);
    }
  }
  return differences.sort();
}

/**
 * Everything U7 is allowed to have changed about the resolved stylesheet.
 *
 * The first two lines are the unit's one deliberate rendering change:
 * `.sound-button` holds `ZVUK`/`TICHO` and the English `SOUND`/`MUTED` U11 adds
 * would overflow a fixed width, so both `width` declarations became a floor.
 *
 * The other three are not rendering changes at all. v7 wrote each of them into
 * the 700 px sheet and then overrode it from a rule written later in the file —
 * the 1050 px block for `.score-chip`, the Arcade 3 layer for the two flight
 * ones — so none of the three ever reached a pixel. The phone sheet is kept
 * whole and therefore loads last, which would resurrect all three; each now
 * states the value v7 actually resolved to instead.
 */
export const DECLARED_STYLE_CHANGES: readonly string[] = [
  '||.sound-button width: 76px -> absent',
  '||.sound-button min-width: absent -> 76px',
  '@media(max-width:700px)||.sound-button width: 32px -> absent',
  '@media(max-width:700px)||.sound-button min-width: absent -> 32px',
  '@media(max-width:700px)||.score-chip padding: 7px 10px -> 9px 10px',
  '@media(max-width:700px)||.flight-card padding-top: 8px -> 16px',
  '@media(max-width:700px)||.flight-steps margin-top: 18px -> 24px',

  // U11 adds one control to the header and the class that hides its accessible
  // name from sight. `.language-button` restates the mono face and the width
  // because the base `.icon-button` is sized for a glyph, not for two capitals;
  // the `:disabled` pair is the mid-run lock, which has to look locked.
  '||.language-button font: absent -> 12px var(--mono)',
  '||.language-button font-weight: absent -> 700',
  '||.language-button letter-spacing: absent -> .5px',
  '||.language-button width: absent -> 39px',
  '@media(max-width:700px)||.language-button font-size: absent -> 10px',
  '@media(max-width:390px)||.language-button width: absent -> 28px',
  '@media(max-width:390px)||.language-button font-size: absent -> 9px',
  '||.icon-button:disabled opacity: absent -> .4',
  '||.icon-button:disabled:hover background: absent -> none',
  '||.visually-hidden position: absent -> absolute',
  '||.visually-hidden width: absent -> 1px',
  '||.visually-hidden height: absent -> 1px',
  '||.visually-hidden margin: absent -> -1px',
  '||.visually-hidden padding: absent -> 0',
  '||.visually-hidden overflow: absent -> hidden',
  '||.visually-hidden clip-path: absent -> inset(50%)',
  '||.visually-hidden white-space: absent -> nowrap',
  '||.visually-hidden border: absent -> 0',
].sort();

/** Every distinct selector in the sheet, in first-seen order. */
export function selectorInventory(sheet: Stylesheet): string[] {
  const seen: string[] = [];
  const known = new Set<string>();
  for (const rule of sheet.rules) {
    for (const selector of rule.selectors) {
      if (known.has(selector)) continue;
      known.add(selector);
      seen.push(selector);
    }
  }
  return seen;
}

/** `media||selector` pairs that occur in more than one rule. */
export function duplicatePairs(sheet: Stylesheet): string[] {
  const counts = new Map<string, number>();
  for (const rule of sheet.rules) {
    for (const selector of rule.selectors) {
      const key = ruleKey(rule.media, selector);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

/**
 * Every `!important` declaration, as `media||selector-list||property`.
 *
 * One entry per declaration as written, not per selector it reaches: the ten
 * of these in this stylesheet are ten decisions somebody made, and expanding
 * `*,*:before,*:after` into three would turn one decision into three.
 */
export function importantDeclarations(sheet: Stylesheet): string[] {
  const found: string[] = [];
  for (const rule of sheet.rules) {
    for (const declaration of rule.declarations) {
      if (!declaration.important) continue;
      found.push(`${ruleKey(rule.media, rule.prelude)}||${declaration.property}`);
    }
  }
  return found;
}
