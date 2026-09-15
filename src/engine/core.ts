/**
 * Pure quiz logic. No DOM, network, mutable country data — and, since U12, no
 * language.
 *
 * Every string a question says out loud arrives in a `QuestionBundle`, and
 * every locale-varying field of a country is read through that same bundle, so
 * the compiler is what stops a Czech capital reaching an English question
 * rather than a convention anybody has to remember. The locale is a type
 * parameter threaded from the bundle: `makeQuestion` given the frozen v7
 * Czech-only records and an English bundle is a type error, not a bad question.
 *
 * A structural port of the v7 `core.js`: same function names, same argument
 * order, same control flow, same property insertion order, same exported
 * surface. The golden fixtures are the only oracle for it and they notice a
 * reordering of the three RNG consumers in `appendQuestion` or of the fields of
 * a game, so nothing here is tidied on the way across.
 *
 * Two shapes are forced by the type checker rather than chosen. Under
 * `noUncheckedIndexedAccess` an element read is `T | undefined`, so `x[i]--`
 * and `x[i] += n` cannot be written and appear as the expanded assignment,
 * which evaluates in the same order. And where the original relies on an index
 * being present, the access carries a `!` and a note saying what guarantees it;
 * the assertion is erased, so a violated assumption fails exactly as it does in
 * the original.
 */
import type {
  AnswerResult,
  BaseQuestion,
  Coordinates,
  CurrencyCode,
  Difficulty,
  GameOptions,
  GameState,
  Iso2,
  Locale,
  LocalizedCountry,
  LocalizedText,
  ProgressState,
  Question,
  QuestionBundle,
  QuestionKind,
  QuestionType,
  Region,
  RegionFilter,
  RunState,
  Turn,
} from './types.ts';

export const TYPES = ['country', 'capital', 'currency', 'language', 'population'] as const;

/**
 * The six playable regions, in the order v7 wrote them.
 *
 * A list of keys rather than the `Record<Region, string>` v7 shipped: the names
 * are language and live in the bundles, and the three call sites that read this
 * — the region filter, the save gate and the validator — only ever wanted the
 * keys and were writing `Object.keys` to get them.
 */
export const REGIONS: readonly Region[] = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'];

/**
 * Where a country's note is appended to the explanation it belongs to.
 *
 * Three lists rather than a flag on the note, because which questions a note
 * answers is a property of the note: Bulgaria's explains a currency, Togo's a
 * population, Malaysia's a capital. Codes, not text, so they stay here.
 */
const CAPITAL_NOTE_COUNTRIES: readonly string[] = ['GQ', 'BI', 'KZ', 'NL', 'MY', 'CI', 'EG'];
const CURRENCY_NOTE_COUNTRIES: readonly string[] = ['BG', 'ZW'];
const POPULATION_NOTE_COUNTRIES: readonly string[] = ['CZ', 'FR', 'UA', 'TG'];

/** The one way a `LocalizedText` becomes a string, and it needs a bundle to do it. */
export const pick = <L extends Locale>(text: LocalizedText<L>, bundle: QuestionBundle<L>): string =>
  text[bundle.locale];

/** `{name}` → `params.name`. The templates are the bundles'; this fills them. */
const fill = (template: string, params: Readonly<Record<string, string | number>>): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole);


export function rng(seed: number): () => number { let a = seed >>> 0; return function () { a += 0x6D2B79F5; let t=a; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
// `j` is drawn from `[0, i]` and `i` from `[1, a.length)`, so both reads hit.
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] { const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];} return a; }
function distance(a: Coordinates, b: Coordinates): number { const r=Math.PI/180,lat1=a.lat*r,lat2=b.lat*r,dl=(a.lon-b.lon)*r; return Math.acos(Math.max(-1,Math.min(1,Math.sin(lat1)*Math.sin(lat2)+Math.cos(lat1)*Math.cos(lat2)*Math.cos(dl)))); }
/**
 * A population as an answer option: rounded to three significant figures and
 * given the magnitude word its size calls for.
 *
 * Below a thousand it is left as a bare number with no grouping and no word,
 * which is v7's behaviour and correct in both languages — twelve of anything
 * is twelve.
 */
export function populationLabel<L extends Locale>(n: number, bundle: QuestionBundle<L>): string {
  if (!Number.isFinite(n) || n <= 0) throw new TypeError(bundle.errors.invalidPopulation);
  if(n>=1e9) return `${(Math.round(n/1e7)/100).toLocaleString(bundle.numberLocale)} ${bundle.magnitudes.billion}`;
  if(n>=1e6) return `${(Math.round(n/1e5)/10).toLocaleString(bundle.numberLocale)} ${bundle.magnitudes.million}`;
  if(n>=1000) return `${Math.round(n/1000).toLocaleString(bundle.numberLocale)} ${bundle.magnitudes.thousand}`;
  return `${Math.round(n/10)*10}`;
}
export function currencyLabel<L extends Locale>(currency: { code: CurrencyCode }, bundle: QuestionBundle<L>): string {
  const label=bundle.currencyUnits[currency.code];
  if(!label)throw new Error(fill(bundle.errors.missingCurrencyUnit,{code:currency.code}));
  return label;
}
/**
 * How a population number's provenance reads, from the tag the dataset carries.
 *
 * The engine used to write the phrase and the `source` tag as literals, so the
 * game kept telling players the numbers came from a Worldometer table for as
 * long as nobody edited `core.ts` — regardless of what `data/build/` actually
 * held. `populationSource` was in the dataset and in `types.ts` with no reader
 * at all. Reading it here is what lets a `data:refresh --accept` change the
 * provenance the player is shown by changing the data, which is the only place
 * the answer is known.
 *
 * Both tags are live and have to stay live: a `wg.run.v7` saved by an older
 * build carries the old one inside its stored questions.
 */
export function populationProvenance<L extends Locale>(source: string, bundle: QuestionBundle<L>): string {
  if(source.startsWith('un-wpp-'))return bundle.provenance.unWpp;
  if(source.startsWith('worldometer-'))return bundle.provenance.worldometer;
  return bundle.provenance.fallback;
}
function candidateCountries<L extends Locale>(country: LocalizedCountry<L>, all: readonly LocalizedCountry<L>[], difficulty: Difficulty, random: () => number): LocalizedCountry<L>[] {
  const others=all.filter(c=>c.code!==country.code);
  const nearby=[...others].sort((a,b)=>distance(country,a)-distance(country,b));
  if(difficulty==='expert') return [...shuffle(nearby.slice(0,16),random),...shuffle(nearby.slice(16),random)];
  if(difficulty==='normal') return [...shuffle(others.filter(c=>c.region===country.region),random),...shuffle(others,random)];
  return shuffle(others,random);
}
function uniqueWrong(values: string[], answer: string, exclude: string[] = []): string[] {
  return [...new Set(values)].filter(v=>typeof v==='string'&&v.trim()&&v!==answer&&!exclude.includes(v));
}
export function makeQuestion<L extends Locale>(country: LocalizedCountry<L>, type: QuestionKind, all: readonly LocalizedCountry<L>[], bundle: QuestionBundle<L>, difficulty: Difficulty = 'normal', random: () => number = Math.random): BaseQuestion {
  if(![...TYPES,'flag'].includes(type)) throw new TypeError(bundle.errors.unknownKind);
  const candidates=candidateCountries(country,all,difficulty,random);
  const name=pick(country.name,bundle),note=pick(country.note,bundle);
  let answer: string, prompt: string, wrong: string[], explanation: string, source='reference';
  if(type==='flag') {
    answer=name;prompt=bundle.prompts.flag;
    wrong=candidates.filter(c=>!sameFlagFamily(country.code,c.code)).map(c=>pick(c.name,bundle));
    explanation=fill(bundle.explanations.flag,{name});source='flags';
  } else if(type==='country') {
    answer=name; prompt=bundle.prompts.country;
    wrong=candidates.map(c=>pick(c.name,bundle));
    explanation=fill(bundle.explanations.country,{name,region:bundle.regions[country.region]});
  } else if(type==='capital') {
    // An entry with no `answer` is the Netherlands case: the ordinary question,
    // asked of a country whose seat of government must stay out of the options.
    const special=bundle.specialCapitals[country.code];
    const capitals=country.capital.map(city=>pick(city,bundle));
    // `validateCountries` rejects an empty `capital`, so index 0 is present.
    answer=special?.answer??capitals[0]!;
    prompt=special?.question??bundle.prompts.capital;
    const excluded=[...capitals,...(special?special.exclude:[])];
    wrong=uniqueWrong(candidates.flatMap(c=>c.capital.map(city=>pick(city,bundle))),answer,excluded);
    explanation= special?.answer!==undefined ? fill(bundle.explanations.capitalSpecial,{capital:answer,note}) : fill(bundle.explanations.capital,{capital:answer});
    if(CAPITAL_NOTE_COUNTRIES.includes(country.code)&&note) explanation+=` ${note}`;
  } else if(type==='currency') {
    // Compare monetary-unit families, not national adjectives or ISO codes.
    // Exclude ALL locally valid families to keep exactly one correct option.
    const chosen=country.currencyNames[0]!; answer=currencyLabel(chosen,bundle);
    const valid=country.currencyNames.map(c=>currencyLabel(c,bundle));
    prompt=bundle.currencyPrompts[country.code]??bundle.prompts.currency;
    wrong=candidates.flatMap(c=>c.currencyNames).map(c=>currencyLabel(c,bundle)).filter(label=>!valid.includes(label));
    const units=country.currencyNames.map(c=>`${pick(c.name,bundle)} (${c.code})`).join(', ');
    explanation=fill(country.currency.length>1?bundle.explanations.currencyMultiple:bundle.explanations.currency,{units});
    if(CURRENCY_NOTE_COUNTRIES.includes(country.code))explanation+=` ${note}`;
  } else if(type==='language') {
    // Distractors exclude every known widespread or official language of the target.
    // `validateCountries` pairs `languages` with `languageNames` one to one.
    const preferred=country.languages.map((code,i)=>({code,name:country.languageNames[i]!}));
    const selected=preferred[Math.floor(random()*preferred.length)]!;
    answer=pick(selected.name,bundle); prompt=bundle.prompts.language;
    wrong=candidates.flatMap(c=>c.languages.map((code,i)=>({code,name:c.languageNames[i]!})))
      .filter(l=>!country.excludeLanguages.includes(l.code)&&!country.languages.includes(l.code)).map(l=>pick(l.name,bundle));
    explanation=fill(bundle.explanations.language,{names:country.languageNames.map(tag=>pick(tag,bundle)).join(', ')});
  } else {
    answer=populationLabel(country.population,bundle); prompt=fill(bundle.prompts.population,{year:country.populationYear});
    const factors=difficulty==='expert'?[0.55,0.72,1.38,1.8]:difficulty==='easy'?[0.2,0.4,2.5,5]:[0.35,0.6,1.7,3];
    // One distractor below and one above; randomize the correct position afterwards.
    const low=factors[Math.floor(random()*2)]!,high=factors[2+Math.floor(random()*2)]!;
    wrong=[populationLabel(Math.max(20,country.population*low),bundle),populationLabel(country.population*high,bundle)];
    explanation=fill(bundle.explanations.population,{year:country.populationYear,count:country.population.toLocaleString(bundle.numberLocale),rounded:answer,provenance:populationProvenance(country.populationSource,bundle),note:POPULATION_NOTE_COUNTRIES.includes(country.code)?note:''});
    source=country.populationSource;
  }
  wrong=uniqueWrong(wrong,answer);
  if(wrong.length<2)throw new Error(fill(bundle.errors.notEnoughAnswers,{code:country.code,type}));
  const options=shuffle([answer,...wrong.slice(0,2)],random);
  return {country:country.code,type,prompt,options,correct:options.indexOf(answer),explanation:explanation.trim(),source};
}
export function getPool<L extends Locale>(all: readonly LocalizedCountry<L>[], options: { region: RegionFilter; difficulty: Difficulty }): LocalizedCountry<L>[] {
  return all.filter(c=>(options.region==='all'||c.region===options.region)&&(options.difficulty!=='easy'||c.easy));
}
export const INITIAL_LIVES = 5;
export const BONUS_INTERVAL = 10000;
export const MILESTONE_LIVES = 2;
// These near-identical flag pairs are not used as distractors for one another.
// Afghanistan's conventional emoji tricolour is documented in the atlas, not quizzed.
const FLAG_FAMILIES: readonly (readonly string[])[] = [['ID','MC'],['RO','TD'],['NL','LU'],['IE','CI'],['AU','NZ']];
export function sameFlagFamily(a: Iso2, b: Iso2): boolean {return FLAG_FAMILIES.some(group=>group.includes(a)&&group.includes(b));}
function livePlayer(game: RunState, after: number): number {
  // `p` is taken modulo the slot count, so it always addresses a player.
  for(let n=1;n<=game.lives.length;n++){const p=(after+n)%game.lives.length;if(game.lives[p]!>0)return p;}
  return -1;
}
function nextCountry<L extends Locale>(game: GameState, all: readonly LocalizedCountry<L>[], random: () => number): LocalizedCountry<L> | undefined {
  const pool=getPool(all,game.options);
  if(!Array.isArray(game.deck)||!game.deck.length){
    game.deck=shuffle(pool.map(c=>c.code),random);
    if(game.deck.length>1&&game.deck[0]===game.lastCountry)[game.deck[0],game.deck[1]]=[game.deck[1]!,game.deck[0]!];
    game.cycles=(game.cycles||0)+1;
  }
  // The deck was just refilled if it was empty, and `makeGame` refuses a pool
  // of fewer than two countries.
  const code=game.deck.shift()!;game.lastCountry=code;
  return all.find(c=>c.code===code);
}
export function nextBonusThreshold(game: RunState, player: number): number {
  return ((game.bonusMilestones?.[player]||0)+1)*BONUS_INTERVAL;
}
// Shared by actual gameplay, save validation and the seeded balance simulator.
export function createEconomy(players = 1): RunState {
  const zeros=():number[]=>Array<number>(players).fill(0);
  return {scores:zeros(),lives:Array<number>(players).fill(INITIAL_LIVES),earnedLives:zeros(),scoreLives:zeros(),flagLives:zeros(),
    bonusMilestones:zeros(),bonusIssued:zeros(),pendingBonuses:Array.from({length:players},()=>[]),countriesPlayed:zeros()};
}
export function spendCountryAttempt(game: RunState, player: number): boolean {
  if(!(game.lives[player]!>0))return false;
  game.lives[player]=game.lives[player]!-1;game.countriesPlayed[player]=game.countriesPlayed[player]!+1;return true;
}
export function awardPoints(game: RunState, player: number, points: number): number[] {
  if(!Number.isSafeInteger(points)||points<0)throw new RangeError('awardPoints takes a non-negative safe integer.');
  game.scores[player]=game.scores[player]!+points;
  const earned=Math.floor(game.scores[player]!/BONUS_INTERVAL),previous=game.bonusMilestones[player]!;
  const thresholds: number[]=[];
  for(let milestone=previous+1;milestone<=earned;milestone++){
    const threshold=milestone*BONUS_INTERVAL;
    thresholds.push(threshold);game.pendingBonuses[player]!.push(threshold);
  }
  const gained=(earned-previous)*MILESTONE_LIVES;
  game.bonusMilestones[player]=earned;game.lives[player]=game.lives[player]!+gained;
  game.earnedLives[player]=game.earnedLives[player]!+gained;game.scoreLives[player]=game.scoreLives[player]!+gained;
  return thresholds;
}
export function awardFlagAttempt(game: RunState, player: number): void {
  game.lives[player]=game.lives[player]!+1;game.earnedLives[player]=game.earnedLives[player]!+1;game.flagLives[player]=game.flagLives[player]!+1;
}
export function consumeBonus(game: RunState, player: number): number | null {
  if(!game.pendingBonuses[player]!.length)return null;
  game.bonusIssued[player]=game.bonusIssued[player]!+1;return game.pendingBonuses[player]!.shift()!;
}
export function nextTurn(game: ProgressState): Turn {
  if(game.completed||game.gameOver)return {kind:'end'};
  const previous=game.questions.at(-1);
  if(!previous)return {kind:'country',player:0,visit:0};
  const player=previous.player;
  // A flag question always records the index of the regular one it was queued behind.
  const regular=previous.type==='flag'?game.questions[previous.regularIndex!]:previous;
  // A country was paid for at entry. All five questions remain playable at zero
  // reserve attempts, including a chance to earn a rescue threshold.
  if(regular&&regular.player===player){
    // `regular` is a regular question on every path that reaches this.
    const step=TYPES.indexOf(regular.type as QuestionType)+1;
    if(step<TYPES.length)return {kind:'question',player,visit:regular.visit,anchor:regular.country,type:TYPES[step]!};
  }
  // Flags are queued, never interrupt the current country and cost no attempt.
  if(game.pendingBonuses[player]!.length)
    return {kind:'bonus',player,visit:previous.visit,anchor:previous.anchor||previous.country,
      regularIndex:previous.type==='flag'?previous.regularIndex!:game.questions.length-1,
      threshold:game.pendingBonuses[player]![0]!};
  const next=livePlayer(game,player);
  return next<0?{kind:'end'}:{kind:'country',player:next,visit:previous.visit+1};
}
export function needsFlight(game: ProgressState): boolean {
  const q=game.questions[game.index];if(!q)return false;
  if(!game.review)return q.type==='country'||q.type==='flag';
  if(q.type==='flag')return true;
  const previous=game.questions[game.index-1];
  return !previous||previous.type==='flag'||previous.country!==q.country;
}
function appendQuestion<L extends Locale>(game: GameState, all: readonly LocalizedCountry<L>[], bundle: QuestionBundle<L>): boolean {
  const random=rng((game.seed+Math.imul(game.questions.length+1,0x9e3779b9))>>>0);
  const next=nextTurn(game);if(next.kind==='end')return false;
  let country: LocalizedCountry<L>|undefined,type: QuestionKind,anchor=next.anchor;
  if(next.kind==='bonus') {
    const recent=game.recentFlags||[];
    let pool=getPool(all,game.options).filter(c=>c.code!==anchor&&c.code!=='AF'&&!recent.includes(c.code));
    if(!pool.length)pool=getPool(all,game.options).filter(c=>c.code!==anchor&&c.code!=='AF');
    country=pool[Math.floor(random()*pool.length)];type='flag';
  } else if(next.kind==='question') {
    country=all.find(c=>c.code===anchor);type=next.type;
  } else {
    // The deck holds codes drawn from `all`; the original reads `.code` off the
    // result here too, one line before the guard below.
    country=nextCountry(game,all,random)!;type=TYPES[0];anchor=country.code;
  }
  if(!country)throw new Error(bundle.errors.noCountries);
  // Every branch above has set `anchor`: two from the turn, one from the draw.
  const question: Question={...makeQuestion(country,type,all,bundle,game.options.difficulty,random),visit:next.visit,player:next.player,anchor:anchor!};
  if(next.kind==='bonus') {
    // `nextTurn` reports a bonus turn only while the queue is non-empty.
    question.bonusThreshold=consumeBonus(game,next.player)!;question.regularIndex=next.regularIndex;
    game.recentFlags=[...(game.recentFlags||[]),country.code].slice(-6);
  }else if(next.kind==='country'){
    question.livesBeforeCountry=game.lives[next.player]!;question.countryCost=1;
    if(!spendCountryAttempt(game,next.player))return false;
  }
  game.questions.push(question);return true;
}
export function makeGame<L extends Locale>(all: readonly LocalizedCountry<L>[], options: GameOptions, bundle: QuestionBundle<L>, seed: number = Math.floor(Math.random()*4294967295)): GameState {
  if(![1,2].includes(options.players))throw new RangeError(bundle.errors.players);
  if(getPool(all,options).length<2)throw new Error(bundle.errors.poolTooSmall);
  const opts={...options,mode:'survival'};delete opts.visits;
  const game: GameState={version:7,seed:seed>>>0,revealedIndex:null,clock:null,options:opts,questions:[],index:0,answers:[],
    ...createEconomy(options.players),deck:[],recentFlags:[],cycles:0,created:new Date().toISOString(),completed:false,gameOver:false};
  appendQuestion(game,all,bundle);return game;
}
export const TIME_LIMITS: Readonly<Record<Difficulty, number>> = Object.freeze({easy:30000,normal:20000,expert:12000});
export const BASE_POINTS = 100, MAX_POINTS = 1000;
export function timeLimit(game: ProgressState): number {return game.review?0:(TIME_LIMITS[game.options.difficulty]||TIME_LIMITS.normal);}
export function pointsForTime(elapsedMs: number, limitMs: number): number {
  if(!Number.isFinite(elapsedMs)||elapsedMs<0||!Number.isFinite(limitMs)||limitMs<0)throw new RangeError('pointsForTime takes two finite, non-negative millisecond counts.');
  if(!limitMs)return 100;
  if(elapsedMs>=limitMs)return 0;
  return BASE_POINTS+Math.round((MAX_POINTS-BASE_POINTS)/10*(1-elapsedMs/limitMs))*10;
}
export function submit(game: ProgressState, selected: number | null, elapsedMs = 0): AnswerResult | null {
  if(game.completed||game.index>=game.questions.length||game.answers[game.index])return null;
  if(!Number.isFinite(elapsedMs)||elapsedMs<0)throw new RangeError('submit takes a finite, non-negative millisecond count.');
  const limit=timeLimit(game),timedOut=limit>0&&elapsedMs>=limit;
  if(selected!==null&&(!Number.isInteger(selected)||selected<0||selected>2))throw new RangeError('submit takes option 0, 1 or 2, or null for a timeout.');
  if(selected===null&&!timedOut)throw new RangeError('submit was given null before the clock ran out.');
  // The bounds check on the first line is what makes this index present.
  const q=game.questions[game.index]!,correct=!timedOut&&selected===q.correct;
  const points=correct?pointsForTime(elapsedMs,limit):0,basePoints=correct?(limit?BASE_POINTS:100):0;
  // The ledger half is attached below, for a live v7 game only, so the literal
  // cannot carry it and cannot be a whole `AnswerResult` on its own.
  const result={selected:timedOut?null:selected,correct,points,basePoints,bonusPoints:points-basePoints,
    elapsedMs:limit?Math.min(elapsedMs,limit):elapsedMs,timeLimitMs:limit,timedOut,player:q.player} as AnswerResult;
  if(game.version===7&&!game.review){
    const before=game.lives[q.player]!;
    const thresholds=awardPoints(game,q.player,points),flagLife=q.type==='flag'&&correct?1:0;
    if(flagLife)awardFlagAttempt(game,q.player);
    Object.assign(result,{lifeDelta:thresholds.length*MILESTONE_LIVES+flagLife,scoreLifeDelta:thresholds.length*MILESTONE_LIVES,flagLifeDelta:flagLife,
      milestoneThresholds:thresholds,livesBefore:before,livesAfter:game.lives[q.player]!,isFlagBonus:q.type==='flag'});
  }else game.scores[q.player]=game.scores[q.player]!+points;
  game.answers[game.index]=result;
  // Elimination is considered only after the paid country AND pending flags.
  if(game.version===7&&!game.review)game.gameOver=nextTurn(game).kind==='end';
  return result;
}
export function advance<L extends Locale>(game: GameState, all: readonly LocalizedCountry<L>[], bundle: QuestionBundle<L>): boolean {
  if(game.completed||!game.answers[game.index])return false;
  if(game.version===7&&!game.review){
    if(game.gameOver){game.completed=true;return false;}
    // English, not catalog copy: a caller that hands the engine something other
    // than an array is a bug in this repository, not something a player can do.
    if(!Array.isArray(all))throw new TypeError('advance needs the country database to continue a run.');
    if(!appendQuestion(game,all,bundle)){game.completed=true;return false;}
  }else if(game.index===game.questions.length-1){game.completed=true;return false;}
  game.index++;game.clock=null;game.revealedIndex=null;return true;
}
/** v7 compares two ledgers key by key, and neither shape is statically indexable. */
const field = (from: object, key: string): unknown => (from as Record<string, unknown>)[key];
// Replaying ledger entries validates saves without regenerating random maps or
// distractors. It also prevents double-charging a country after resume.
export function validateProgress(game: GameState): boolean {
  try{
    if(game.version!==7)return false;
    const replay: ProgressState={version:7,options:game.options,questions:[],answers:[],index:0,completed:false,gameOver:false,...createEconomy(game.options.players)};
    for(let i=0;i<game.questions.length;i++){
      // `i` walks `questions`; `answers` may be one entry shorter.
      const q=game.questions[i]!,answer=game.answers[i],next=nextTurn(replay);
      if(next.kind==='end'||q.player!==next.player||q.visit!==next.visit)return false;
      if(next.kind==='country'){
        if(q.type!=='country'||q.country!==q.anchor||q.countryCost!==1||q.livesBeforeCountry!==replay.lives[q.player])return false;
        if(!spendCountryAttempt(replay,q.player))return false;
      }else if(next.kind==='bonus'){
        if(q.type!=='flag'||q.bonusThreshold!==next.threshold||q.regularIndex!==next.regularIndex||q.anchor!==next.anchor)return false;
        consumeBonus(replay,q.player);
      }else if(q.type!==next.type||q.country!==next.anchor||q.anchor!==next.anchor)return false;
      replay.questions.push(q);replay.index=i;
      if(answer){
        const expected=submit(replay,answer.selected,answer.elapsedMs);
        if(!expected||Object.keys(expected).some(key=>JSON.stringify(field(expected,key))!==JSON.stringify(field(answer,key))))return false;
      }else if(i!==game.questions.length-1)return false;
    }
    return Object.keys(createEconomy(game.options.players)).every(key=>JSON.stringify(field(replay,key))===JSON.stringify(field(game,key)))&&replay.gameOver===game.gameOver;
  }catch{return false;}
}
export function validateCountries<L extends Locale>(all: unknown, bundle: QuestionBundle<L>): boolean {
  if(!Array.isArray(all)||all.length<3)throw new Error(bundle.errors.databaseMissing);
  const codes=new Set<string>();
  for(const c of all){
    if(!/^[A-Z]{2}$/.test(c.code)||codes.has(c.code))throw new Error(fill(bundle.errors.badCode,{code:String(c.code)}));
    codes.add(c.code);
    for(const key of ['capital','currency','currencyNames','languages','languageNames','excludeLanguages'])if(!Array.isArray(c[key])||!c[key].length)throw new Error(fill(bundle.errors.missingField,{code:String(c.code),field:key}));
    if(c.languages.length!==c.languageNames.length)throw new Error(bundle.errors.languageMismatch);
    if(!Number.isFinite(c.lat)||Math.abs(c.lat)>90||!Number.isFinite(c.lon)||Math.abs(c.lon)>180)throw new Error(bundle.errors.badPosition);
    if(!Number.isSafeInteger(c.population)||c.population<=0)throw new Error(bundle.errors.badPopulation);
    if(!REGIONS.includes(c.region as Region))throw new Error(fill(bundle.errors.unknownRegion,{code:String(c.code)}));
  }
  return true;
}
