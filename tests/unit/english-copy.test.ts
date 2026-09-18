/**
 * U17 — the prose that could not be generated.
 *
 * U12 generated the English *names* — country, capital, currency, language —
 * out of CLDR, and a generated name is either right or reviewable. What it
 * deliberately left behind is everything that is an argument rather than a
 * label: the 22 country notes that say which city a question is really asking
 * about and whose claim is disputed, and the citations that say what each
 * source was used *for*. Those carry geopolitical framing, and a machine
 * rendering of "Palestina nárokuje Východní Jeruzalém" is not a translation of
 * it, it is a guess wearing one.
 *
 * So the risk here is not a crash. It is a screen that renders perfectly in
 * English and is still Czech, or — worse — an English sentence that says
 * something the Czech one does not. The first is what this file tests. The
 * second is a human's judgement and is what `docs/reviews/english-dataset.md`
 * exists to collect.
 *
 * The one thing asserted negatively throughout is "not a verbatim copy of the
 * Czech". That is the failure mode a hurried translation pass actually has:
 * the file gains an `en` key, every count check passes, and the value beside it
 * is the Czech sentence moved across. Where a string is legitimately identical
 * in both languages it is declared, by name, below.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installApp, type Harness } from '../helpers/app-harness.ts';
import { captureViews } from '../helpers/views-golden.ts';
import { csQuestions } from '../../src/i18n/questions.cs.ts';
import { enQuestions } from '../../src/i18n/questions.en.ts';
import { cs } from '../../src/i18n/cs.ts';
import { en } from '../../src/i18n/en.ts';
import { esc } from '../../src/app/dom.ts';
import { setLocale } from '../../src/i18n/index.ts';
import type { LocalizedCountry, LocalizedText } from '../../src/engine/types.ts';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = <T>(relative: string): T => JSON.parse(readFileSync(join(REPO_ROOT, relative), 'utf8')) as T;

interface NoteFile { why: string; notes: Record<string, string> }
interface Citation { name: LocalizedText; url: string; use: LocalizedText }

const notesCs = read<NoteFile>('data/overrides/notes.cs.json');
const notesEn = read<NoteFile>('data/overrides/notes.en.json');
const citations = read<Citation[]>('data/build/sources.json');
const dataset = read<LocalizedCountry[]>('data/build/countries.json');

/**
 * Citations whose name is the same sentence in both languages, and why.
 *
 * A product name with a release number in it has no English word to translate,
 * and paraphrasing one to satisfy a "must differ" rule would make the citation
 * wrong. `use` is not on this list and has no exceptions: every citation
 * explains its own use in prose, and prose always differs.
 */
const SAME_NAME_IN_BOTH: readonly string[] = ['Natural Earth – 1:110m Admin 0, v5.1.2'];

/** Long enough that finding it inside a rendered page is not a coincidence. */
const DISTINCTIVE = 40;

describe('the country notes', () => {
  it('says in English everything it says in Czech', () => {
    expect(Object.keys(notesEn.notes).sort()).toEqual(Object.keys(notesCs.notes).sort());
    expect(Object.keys(notesEn.notes)).toHaveLength(22);
  });

  it('gives every note a non-blank English sentence', () => {
    const blank = Object.entries(notesEn.notes).filter(([, text]) => text.trim() === '');
    expect(blank.map(([code]) => code)).toEqual([]);
  });

  it('translates rather than copying', () => {
    // The whole point of the unit. A note that came across unchanged would
    // pass every count above and still be Czech on an English player's screen.
    const copied = Object.keys(notesCs.notes).filter((code) => notesCs.notes[code] === notesEn.notes[code]);
    expect(copied).toEqual([]);
  });

  it('reaches the dataset the atlas reads, and only there', () => {
    // A note in the override file that never made it through the merge would
    // be invisible: the atlas prints `note.en`, not the override.
    const withNote = dataset.filter((country) => country.note.en !== '').map((country) => country.code as string);
    expect(withNote.sort()).toEqual(Object.keys(notesEn.notes).sort());
    for (const country of dataset) {
      if (country.note.en === '') continue;
      expect(country.note.en).toBe(notesEn.notes[country.code as string]);
    }
  });

  it('carries the framing the Czech carries, on the countries that have a claim in them', () => {
    // Not a translation check — a check that the four notes whose subject is a
    // disputed claim still name the thing in dispute. A note that lost the
    // dispute would read as a plain fact, which is the specific way these can
    // go wrong quietly.
    expect(notesEn.notes['PS']).toContain('disputed');
    expect(notesEn.notes['IL']).toContain('disputed');
    expect(notesEn.notes['EG']).toContain('Cairo');
    expect(notesEn.notes['ZW']).toContain('ZWG');
  });
});

describe('the citations', () => {
  it('gives every entry a name and a use in both languages', () => {
    const blank: string[] = [];
    for (const entry of citations) {
      for (const locale of ['cs', 'en'] as const) {
        if ((entry.name[locale] ?? '').trim() === '') blank.push(`${entry.url} name.${locale}`);
        if ((entry.use[locale] ?? '').trim() === '') blank.push(`${entry.url} use.${locale}`);
      }
    }
    expect(blank).toEqual([]);
    expect(citations.length).toBeGreaterThanOrEqual(16);
  });

  it('never copies a use across, and copies a name only where that is right', () => {
    expect(citations.filter((entry) => entry.use.cs === entry.use.en).map((entry) => entry.name.cs)).toEqual([]);
    const sameName = citations.filter((entry) => entry.name.cs === entry.name.en).map((entry) => entry.name.cs);
    expect(sameName).toEqual(SAME_NAME_IN_BOTH.filter((name) => sameName.includes(name)));
    expect(sameName).toEqual([...SAME_NAME_IN_BOTH]);
  });

  it('keeps one link per entry, which is not a translatable thing', () => {
    for (const entry of citations) {
      expect(entry.url).toMatch(/^https:\/\//);
      // `url` is a plain string rather than a LocalizedText on purpose: the
      // same page is the same page, and `data:check` matches a pinned download
      // against this field.
      expect(typeof entry.url).toBe('string');
    }
    expect(new Set(citations.map((entry) => entry.url)).size).toBe(citations.length);
  });

  it('credits no retired source in either language', () => {
    // The Czech half is already guarded by `data:check`; this is the same
    // claim about the half U17 added, stated where the English is written.
    const english = citations.map((entry) => `${entry.name.en} ${entry.use.en}`).join('\n').toLowerCase();
    for (const needle of ['worldometer', 'countryinfo', 'babel', 'pyogrio', 'pycountry']) {
      expect(english).not.toContain(needle);
    }
  });
});

describe('the special-capital questions', () => {
  it('asks all ten in English', () => {
    const asked = Object.entries(enQuestions.specialCapitals).filter(([, entry]) => entry.question !== undefined);
    expect(asked).toHaveLength(10);
    for (const [code, entry] of asked) {
      expect(entry.question, code).not.toBe('');
      expect(entry.answer, code).toBeDefined();
      expect(entry.answer, code).not.toBe('');
    }
  });

  it('covers exactly the countries the Czech covers', () => {
    expect(Object.keys(enQuestions.specialCapitals).sort()).toEqual(
      Object.keys(csQuestions.specialCapitals).sort(),
    );
    for (const code of Object.keys(csQuestions.specialCapitals)) {
      const czech = csQuestions.specialCapitals[code]!;
      const english = enQuestions.specialCapitals[code]!;
      expect(english.question === undefined, code).toBe(czech.question === undefined);
      expect(english.answer === undefined, code).toBe(czech.answer === undefined);
    }
  });

  it('writes a different sentence, even where the answer is the same word', () => {
    // Bern is Bern and Pretoria is Pretoria — an answer may legitimately match.
    // A *question* never can: every one of them is a sentence.
    for (const [code, english] of Object.entries(enQuestions.specialCapitals)) {
      const czech = csQuestions.specialCapitals[code]!;
      if (english.question === undefined) continue;
      expect(english.question, code).not.toBe(czech.question);
    }
    expect(enQuestions.currencyPrompts['ZW']).not.toBe(csQuestions.currencyPrompts['ZW']);
  });
});

describe('the two dialogs a player reads for prose', () => {
  let app: Harness;
  let views: Record<string, string>;

  beforeEach(async () => {
    app = installApp();
    setLocale('en');
    views = await captureViews(app);
  });
  afterEach(() => { app.restore(); setLocale('cs'); });

  /** Catalog entries that are whole sentences: no interpolation, long enough to find. */
  const prose = (prefix: string): string[] =>
    Object.keys(cs).filter((key) => {
      const value = en[key as keyof typeof en];
      return (
        key.startsWith(prefix) &&
        typeof value === 'string' &&
        !value.includes('{') &&
        value.length >= DISTINCTIVE
      );
    });

  it('renders the help dialog fully in English', () => {
    const html = views['dialog/help'] ?? '';
    expect(html).not.toBe('');
    const keys = prose('help.');
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) {
      expect(html, key).toContain(en[key as keyof typeof en] as string);
      const czech = cs[key as keyof typeof cs] as string;
      if (czech !== en[key as keyof typeof en]) expect(html, key).not.toContain(czech);
    }
  });

  it('renders the sources dialog fully in English, citations and all', () => {
    const html = views['dialog/sources'] ?? '';
    expect(html).not.toBe('');
    for (const key of prose('sources.')) {
      expect(html, key).toContain(en[key as keyof typeof en] as string);
      const czech = cs[key as keyof typeof cs] as string;
      if (czech !== en[key as keyof typeof en]) expect(html, key).not.toContain(czech);
    }

    // …and the part that is data rather than catalog: every citation, in
    // English, with the Czech nowhere on the page.
    for (const entry of citations) {
      expect(html, entry.url).toContain(esc(entry.name.en));
      expect(html, entry.url).toContain(esc(entry.use.en));
      if (entry.use.cs !== entry.use.en) expect(html, entry.url).not.toContain(esc(entry.use.cs));
    }
  });

  it('gives every citation a working link, once', () => {
    const html = views['dialog/sources'] ?? '';
    for (const entry of citations) {
      const href = `href="${esc(entry.url)}"`;
      expect(html, entry.url).toContain(href);
      expect(html.split(href).length - 1, entry.url).toBe(1);
    }
    // Opening an external page must not hand it a window handle back.
    expect(html.split('target="_blank"').length - 1).toBe(citations.length);
    expect(html.split('rel="noopener noreferrer"').length - 1).toBe(citations.length);
  });

  it('still renders both dialogs in Czech', async () => {
    // The other half of the claim: adding English did not take Czech away.
    // `views-cs-golden.json` holds the byte-level version of this; here it is
    // only the two dialogs, so a failure says which one.
    setLocale('cs');
    const czech = await captureViews(app);
    for (const key of prose('help.')) {
      expect(czech['dialog/help'], key).toContain(cs[key as keyof typeof cs] as string);
    }
    for (const entry of citations) {
      expect(czech['dialog/sources'], entry.url).toContain(esc(entry.use.cs));
    }
  });
});

describe('the two SourceEntry declarations', () => {
  it('describe the same record, in the pipeline and in the page', () => {
    // `src/` cannot import from `scripts/` — the bundle would pull the data
    // pipeline into the browser — so the citation shape is written twice. A
    // drift between them is a runtime shape error no compiler would catch, so
    // the fields are compared as text.
    const fields = (path: string): string[] => {
      const text = readFileSync(join(REPO_ROOT, path), 'utf8');
      const body = /export interface SourceEntry \{([^}]*)\}/.exec(text)?.[1];
      if (body === undefined) throw new Error(`${path} no longer declares SourceEntry`);
      return body
        .split('\n')
        .map((line) => line.trim().replace(/;$/, ''))
        .filter((line) => line !== '' && !line.startsWith('//') && !line.startsWith('*'));
    };
    expect(fields('src/app/dialogs/sources.ts')).toEqual(fields('scripts/data/sources.ts'));
    expect(fields('scripts/data/sources.ts')).toEqual(['name: LocalizedText', 'url: string', 'use: LocalizedText']);
  });
});
