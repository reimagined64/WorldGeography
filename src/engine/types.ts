/**
 * The v7 data model, declared once.
 *
 * The shapes here are read off the shipped `core.js` and the committed
 * `wg.run.v7` payloads rather than designed: every field exists because the
 * engine, the save gate or a golden fixture depends on it, and the property
 * order of `GameState` and `Question` is itself observable through the
 * canonical serializer in `tests/helpers/golden.ts`.
 *
 * The four code types are branded, so a capital, a currency unit and a country
 * name — all plain strings in the data — cannot be passed for one another.
 * Data arrives as JSON and is asserted into these types at the loading
 * boundary; `validateCountries` is the runtime half of that claim.
 *
 * The locale dimension arrived in U8 as a second set of shapes rather than a
 * widening of the first, and U12 collapsed them again: `LocalizedCountry` is
 * the only country record now. The Czech-only `Country` v7 shipped is gone from
 * `src/` entirely — the one place it survives is `tests/helpers/load-baseline.ts`,
 * which types the frozen v7 fixture the golden oracle is captured from.
 *
 * `QuestionBundle` is the other half of that collapse. Every string question
 * generation says out loud lives in one, so the engine holds no language at
 * all, and the locale is a type parameter rather than a convention: a bundle
 * and a country record that disagree about which locale they carry do not
 * compile.
 */

declare const KIND: unique symbol;

/** Phantom tag. Erased at runtime; only the `string` survives. */
type Branded<Name extends string> = { readonly [KIND]: Name };

/** ISO 3166-1 alpha-2, the identity the engine, the deck and the saves use. */
export type Iso2 = string & Branded<'Iso2'>;
/** ISO 3166-1 alpha-3, carried for the atlas and the flag files only. */
export type Iso3 = string & Branded<'Iso3'>;
/** ISO 4217, the key into `CURRENCY_UNITS`. */
export type CurrencyCode = string & Branded<'CurrencyCode'>;
/** The language tags the distractor filter compares; not BCP 47. */
export type LangCode = string & Branded<'LangCode'>;

/** The six regions `REGIONS` names. A country outside them fails validation. */
export type Region =
  | 'Europe'
  | 'Asia'
  | 'Africa'
  | 'North America'
  | 'South America'
  | 'Oceania';

/** What a game may be restricted to: one region, or the whole world. */
export type RegionFilter = Region | 'all';

export type Difficulty = 'easy' | 'normal' | 'expert';

/** The five questions a country visit walks through, in `TYPES` order. */
export type QuestionType = 'country' | 'capital' | 'currency' | 'language' | 'population';

/** Everything `makeQuestion` can build: the five plus the queued flag bonus. */
export type QuestionKind = QuestionType | 'flag';

/** A currency as one locale spells it. Only the frozen v7 fixture is this shape. */
export interface CurrencyName {
  code: CurrencyCode;
  name: string;
}

/**
 * The locales the dataset can carry. v7 shipped `cs`; U12 added `en`.
 *
 * Not a list of UI languages: this is the dimension the *data* varies over, so
 * a locale here means there is a `data/overrides/countries.<locale>.json` and a
 * `notes.<locale>.json` for it, hand-written, and a fetch that resolved
 * upstream display names in it.
 */
export type Locale = 'cs' | 'en';

/**
 * One string per locale the dataset carries.
 *
 * Parameterised rather than fixed at `Record<Locale, string>` because a dataset
 * built from the `cs` bundle alone has to type-check without a half-filled
 * `en`: `LocalizedText<'cs'>` is `{ cs: string }` and nothing else. The shipped
 * dataset carries both, and the narrow form is what `tests/helpers/load-baseline.ts`
 * lifts the frozen v7 fixture into — so a bundle and a record that disagree
 * about which locale they carry is a compile error, which is the point.
 */
export type LocalizedText<L extends Locale = Locale> = Record<L, string>;

/**
 * One locale's hand-edited text: `data/overrides/countries.<locale>.json` and
 * `notes.<locale>.json`, loaded and joined.
 *
 * `capitals` is the odd one out: it is keyed by the capital name *upstream*
 * uses, not by country code, because it is a translation table applied to a
 * fetched capital. A capital pinned in `capitals.json` is a finished name and
 * never passes through it. The other four are keyed by ISO 3166-1 alpha-2, ISO
 * 4217 and language tag.
 */
export interface LocaleBundle<L extends Locale = Locale> {
  locale: L;
  names: Readonly<Record<string, string>>;
  capitals: Readonly<Record<string, string>>;
  currencies: Readonly<Record<string, string>>;
  languages: Readonly<Record<string, string>>;
  notes: Readonly<Record<string, string>>;
}

/** `CurrencyName` with the display name widened over the locales carried. */
export interface LocalizedCurrencyName<L extends Locale = Locale> {
  code: CurrencyCode;
  name: LocalizedText<L>;
}

/**
 * One country, with every locale-varying field widened over the locales carried.
 *
 * The five widened fields are exactly the ones `prepare_data.py` resolved
 * through Czech CLDR — name, capital, currency names, language names, note —
 * and no others: a population, a coordinate and a region are the same fact in
 * any language.
 *
 * `capital` and `languageNames` are arrays of `LocalizedText` rather than a
 * `LocalizedText` of arrays, so no locale can quietly disagree about how many
 * capitals a country has or how many languages the question offers; the merge
 * rejects a fetch where they do.
 */
export interface LocalizedCountry<L extends Locale = Locale> {
  code: Iso2;
  iso3: Iso3;
  name: LocalizedText<L>;
  capital: LocalizedText<L>[];
  currency: CurrencyCode[];
  currencyNames: LocalizedCurrencyName<L>[];
  languages: LangCode[];
  languageNames: LocalizedText<L>[];
  excludeLanguages: LangCode[];
  lat: number;
  lon: number;
  region: Region;
  population: number;
  populationYear: number;
  populationKind: string;
  populationSource: string;
  note: LocalizedText<L>;
  easy: boolean;
}

/**
 * A capital question the dataset cannot answer on its own.
 *
 * Ten countries have a capital that is contested, duplicated or in the middle
 * of moving, and for those the question is asked differently — "which city is
 * the seat of the Swiss federal government?" rather than "what is the capital
 * of this country?". An eleventh kind of entry carries no question at all and
 * only an `exclude` list: the Netherlands is asked the ordinary way, but The
 * Hague must not turn up among the wrong answers.
 *
 * `exclude` is string-matched against the capitals of the candidate countries,
 * so every entry has to be spelled exactly as the dataset spells it **in this
 * locale**. That is the whole reason this table is per-locale rather than
 * keyed by city: a list of Czech city names filters nothing out of an English
 * question, and the question that results has two correct answers (R18).
 */
export interface SpecialCapital {
  /** Absent where the ordinary prompt is asked and only `exclude` differs. */
  question?: string;
  /** Absent with `question`; the answer is then the country's first capital. */
  answer?: string;
  exclude: string[];
}

/**
 * Everything question generation says out loud, in one language.
 *
 * The engine holds no language of its own. It is handed one of these and
 * resolves every display string through it — prompts, explanations, region
 * names, currency units, magnitude suffixes, the special-capital table, and
 * even the errors a player can be shown — so there is no path by which a Czech
 * label reaches an English question.
 *
 * That claim is the type parameter's job rather than a convention. `L` is the
 * locale this bundle speaks, and a `LocalizedText<L>` can only be read through
 * a bundle that speaks it, so `makeQuestion` given Czech-only country records
 * and an English bundle does not compile. KTD12 requires the per-locale tables
 * to swap together or not at all; here they are one object, so there is nothing
 * to swap halfway.
 *
 * Copy is carried as templates with `{name}` placeholders rather than as
 * functions, so the whole of what a player reads is greppable in one file per
 * language and a translator never has to read code to find it.
 */
export interface QuestionBundle<L extends Locale = Locale> {
  locale: L;
  /**
   * The tag `toLocaleString` formats numbers with.
   *
   * Spelled out with a region rather than reusing `locale`, because the
   * fixtures record `cs-CZ` grouping — a narrow no-break space — and a bare
   * `cs` is only the same thing for as long as CLDR keeps it so.
   */
  numberLocale: string;
  /** The six playable regions, as the country explanation names them. */
  regions: Readonly<Record<Region, string>>;
  /**
   * ISO 4217 → the bare monetary unit a player is offered as an option.
   *
   * Deliberately *not* the currency's full name: the question asks which unit
   * the country uses, so the options read "dollar", not "United States Dollar",
   * and every dollar in the world shares one entry. That collapsing is what
   * keeps a second correct answer out of the options, so the partition it
   * induces has to be the same in every locale — `locale-integrity.test.ts`
   * asserts exactly that, code pair by code pair.
   */
  currencyUnits: Readonly<Record<string, string>>;
  /** What `populationLabel` appends. Not suffixes in every language, but these two. */
  magnitudes: { billion: string; million: string; thousand: string };
  /** Keyed by ISO 3166-1 alpha-2. See `SpecialCapital`. */
  specialCapitals: Readonly<Record<string, SpecialCapital>>;
  /** A currency prompt that names one country, keyed by ISO 3166-1 alpha-2. */
  currencyPrompts: Readonly<Record<string, string>>;
  /** How a population's provenance reads, by the tag the dataset carries. */
  provenance: { unWpp: string; worldometer: string; fallback: string };
  prompts: {
    flag: string;
    country: string;
    capital: string;
    currency: string;
    language: string;
    /** `{year}` */
    population: string;
  };
  explanations: {
    /** `{name}` */
    flag: string;
    /** `{name}`, `{region}` */
    country: string;
    /** `{capital}` */
    capital: string;
    /** `{capital}`, `{note}` */
    capitalSpecial: string;
    /** `{units}` */
    currency: string;
    /** `{units}` — the country has more than one valid currency. */
    currencyMultiple: string;
    /** `{names}` */
    language: string;
    /** `{year}`, `{count}`, `{rounded}`, `{provenance}`, `{note}` */
    population: string;
  };
  /**
   * The throws a player can end up reading.
   *
   * Not every throw in the engine: the ones reachable only by calling it wrong
   * — a negative elapsed time, an out-of-range option index — stay in English
   * in the source, because nobody but a developer can provoke them. These are
   * the ones `startGame` and `boot` catch and print.
   */
  errors: {
    unknownKind: string;
    /** `{code}` */
    missingCurrencyUnit: string;
    invalidPopulation: string;
    /** `{code}`, `{type}` */
    notEnoughAnswers: string;
    noCountries: string;
    players: string;
    poolTooSmall: string;
    databaseMissing: string;
    /** `{code}` */
    badCode: string;
    /** `{code}`, `{field}` */
    missingField: string;
    languageMismatch: string;
    badPosition: string;
    badPopulation: string;
    /** `{code}` */
    unknownRegion: string;
  };
}

/** What `distance` needs, which is less than a whole country. */
export interface Coordinates {
  lat: number;
  lon: number;
}

export interface GameOptions {
  /** 1 or 2; `makeGame` rejects anything else at runtime. */
  players: number;
  difficulty: Difficulty;
  region: RegionFilter;
  names: string[];
  /** Stamped by `makeGame`, never supplied by a caller. */
  mode?: string;
  /** A v6 option `makeGame` deletes rather than carry into a v7 game. */
  visits?: number;
}

/** What `makeQuestion` returns, before a question is placed in a game. */
export interface BaseQuestion {
  country: Iso2;
  type: QuestionKind;
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
  source: string;
}

/**
 * A placed question. The four optional fields are the ledger `validateProgress`
 * replays: a country entry carries `livesBeforeCountry` and `countryCost`, a
 * flag bonus carries `bonusThreshold` and `regularIndex`, and no question
 * carries both.
 */
export interface Question extends BaseQuestion {
  visit: number;
  player: number;
  anchor: Iso2;
  bonusThreshold?: number;
  regularIndex?: number;
  livesBeforeCountry?: number;
  countryCost?: number;
}

/**
 * What `submit` returns and a save stores.
 *
 * The seven ledger fields from `lifeDelta` on are written for a live v7 game
 * only; the `review` branch omits them. Nothing in this project plays a review
 * game, and `validateProgress` compares stored answers field by field, so
 * adding or renaming one field here rejects every player's save on their next
 * visit.
 */
export interface AnswerResult {
  selected: number | null;
  correct: boolean;
  points: number;
  basePoints: number;
  bonusPoints: number;
  elapsedMs: number;
  timeLimitMs: number;
  timedOut: boolean;
  player: number;
  lifeDelta: number;
  scoreLifeDelta: number;
  flagLifeDelta: number;
  milestoneThresholds: number[];
  livesBefore: number;
  livesAfter: number;
  isFlagBonus: boolean;
}

/**
 * The attempt-and-score ledger, one slot per player.
 *
 * `createEconomy` builds it, gameplay mutates it, `validateProgress` rebuilds
 * it from the stored questions and answers and compares field by field, and
 * the balance simulator models it in closed form.
 */
export interface RunState {
  scores: number[];
  lives: number[];
  earnedLives: number[];
  scoreLives: number[];
  flagLives: number[];
  bonusMilestones: number[];
  bonusIssued: number[];
  pendingBonuses: number[][];
  countriesPlayed: number[];
}

/** The per-question clock as a save stores it; `GeoClock` is the live object. */
export interface ClockSnapshot {
  index: number;
  elapsedMs: number;
  paused: boolean;
}

/**
 * The half of a game `nextTurn`, `submit`, `needsFlight` and `timeLimit` read.
 *
 * `validateProgress` replays a run into an object of exactly this shape — no
 * seed, no deck, no clock — so the engine may never reach past it on the paths
 * validation walks.
 */
export interface ProgressState extends RunState {
  version: number;
  options: GameOptions;
  questions: Question[];
  answers: AnswerResult[];
  index: number;
  completed: boolean;
  gameOver: boolean;
  /** An atlas replay: no time limit, no ledger, no elimination. */
  review?: boolean;
}

/** A playable game: the saved `wg.run.v7` payload in full. */
export interface GameState extends ProgressState {
  seed: number;
  revealedIndex: number | null;
  clock: ClockSnapshot | null;
  deck: Iso2[];
  recentFlags: Iso2[];
  cycles: number;
  created: string;
  lastCountry?: Iso2;
  /**
   * The language the questions in this run were written in.
   *
   * A run bakes its prompts, options and explanations at creation, so the run
   * and the interface it is resumed into have to agree; `isValidRun` drops a
   * save that disagrees rather than resuming into a half-translated game.
   * Absent on every `wg.run.v7` written before U11, which is why it is optional
   * and why an absent one is read as Czech — the only language that existed
   * when such a save was written.
   */
  lang?: Locale;
}

/**
 * What happens after the question that was just answered.
 *
 * `anchor` is declared absent on a country turn rather than omitted from the
 * variant, because `appendQuestion` reads it before it knows which turn it has.
 */
export type Turn =
  | { kind: 'end' }
  | { kind: 'country'; player: number; visit: number; anchor?: undefined }
  | { kind: 'question'; player: number; visit: number; anchor: Iso2; type: QuestionType }
  | {
      kind: 'bonus';
      player: number;
      visit: number;
      anchor: Iso2;
      regularIndex: number;
      threshold: number;
    };
