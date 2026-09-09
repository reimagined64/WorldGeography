/**
 * Pure quiz logic. No DOM, network, or mutable country data.
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
  Country,
  CurrencyCode,
  Difficulty,
  GameOptions,
  GameState,
  Iso2,
  ProgressState,
  Question,
  QuestionKind,
  QuestionType,
  Region,
  RegionFilter,
  RunState,
  Turn,
} from './types.ts';

export const TYPES = ['country', 'capital', 'currency', 'language', 'population'] as const;
export const LABELS: Readonly<Record<QuestionKind, string>> = {country:'Stát',capital:'Hlavní město',currency:'Měna',language:'Jazyk',population:'Obyvatelstvo',flag:'Vlajkový bonus'};
export const REGIONS: Readonly<Record<Region, string>> = {'Europe':'Evropa','Asia':'Asie','Africa':'Afrika','North America':'Severní Amerika','South America':'Jižní Amerika','Oceania':'Oceánie'};

interface SpecialCapital {
  question: string;
  answer: string;
  exclude: string[];
}

const SPECIAL_CAPITALS: Readonly<Record<string, SpecialCapital>> = {
  ID:{question:'Jak se jmenuje nové hlavní město, které Indonésie buduje?',answer:'Nusantara',exclude:['Jakarta']},
  PS:{question:'Které město je správním sídlem Palestinské samosprávy?',answer:'Ramalláh',exclude:['Východní Jeruzalém (nárokovaný)','Jeruzalém']},
  IL:{question:'Ve kterém městě sídlí izraelský parlament Kneset?',answer:'Jeruzalém',exclude:[]},
  YE:{question:'Které město je ústavním hlavním městem Jemenu?',answer:'Saná',exclude:['Aden']},
  CH:{question:'Které město je sídlem švýcarské spolkové vlády?',answer:'Bern',exclude:[]},
  NR:{question:'Ve kterém distriktu sídlí vláda Nauru?',answer:'Yaren',exclude:['Yaren (sídlo vlády)']},
  ZA:{question:'Které město je výkonným hlavním městem Jihoafrické republiky?',answer:'Pretoria',exclude:['Kapské Město','Bloemfontein','Johannesburg']},
  SZ:{question:'Které město je správním hlavním městem Eswatini?',answer:'Mbabane',exclude:['Lobamba']},
  BO:{question:'Které město je ústavním hlavním městem Bolívie?',answer:'Sucre',exclude:['La Paz']},
  LK:{question:'Ve kterém městě sídlí parlament Srí Lanky?',answer:'Šrí Džajavardanapura Kotte',exclude:['Kolombo','Colombo']},
};

export function rng(seed: number): () => number { let a = seed >>> 0; return function () { a += 0x6D2B79F5; let t=a; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
// `j` is drawn from `[0, i]` and `i` from `[1, a.length)`, so both reads hit.
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] { const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];} return a; }
function distance(a: Coordinates, b: Coordinates): number { const r=Math.PI/180,lat1=a.lat*r,lat2=b.lat*r,dl=(a.lon-b.lon)*r; return Math.acos(Math.max(-1,Math.min(1,Math.sin(lat1)*Math.sin(lat2)+Math.cos(lat1)*Math.cos(lat2)*Math.cos(dl)))); }
export function populationLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) throw new TypeError('Neplatný počet obyvatel.');
  if(n>=1e9) return `${(Math.round(n/1e7)/100).toLocaleString('cs-CZ')} mld.`;
  if(n>=1e6) return `${(Math.round(n/1e5)/10).toLocaleString('cs-CZ')} mil.`;
  if(n>=1000) return `${Math.round(n/1000).toLocaleString('cs-CZ')} tis.`;
  return `${Math.round(n/10)*10}`;
}
export const CURRENCY_UNITS: Readonly<Record<string, string>> = Object.freeze({"AFN":"afghán","ALL":"lek","DZD":"dinár","EUR":"euro","AOA":"kwanza","XCD":"dolar","ARS":"peso","AMD":"dram","AUD":"dolar","BSD":"dolar","BHD":"dinár","BDT":"taka","BBD":"dolar","BZD":"dolar","XOF":"frank","BTN":"ngultrum","INR":"rupie","BOB":"boliviano","BAM":"marka","BWP":"pula","BRL":"real","BND":"dolar","BIF":"frank","BYN":"rubl","CLP":"peso","CDF":"frank","DOP":"peso","DKK":"koruna","DJF":"frank","EGP":"libra","USD":"dolar","ERN":"nakfa","SZL":"lilangeni","ZAR":"rand","ETB":"birr","FJD":"dolar","PHP":"peso","XAF":"frank","GMD":"dalasi","GHS":"cedi","GEL":"lari","GTQ":"quetzal","GNF":"frank","GYD":"dolar","HTG":"gourde","HNL":"lempira","IDR":"rupie","IQD":"dinár","ISK":"koruna","ILS":"šekel","JMD":"dolar","JPY":"jen","YER":"rijál","KRW":"won","SSP":"libra","JOD":"dinár","KHR":"riel","CAD":"dolar","CVE":"escudo","QAR":"rijál","KZT":"tenge","KES":"šilink","COP":"peso","KMF":"frank","CRC":"colón","CUP":"peso","KWD":"dinár","KGS":"som","LAK":"kip","LSL":"loti","LBP":"libra","LYD":"dinár","LRD":"dolar","CHF":"frank","MGA":"ariary","MYR":"ringgit","MWK":"kwacha","MVR":"rupie","MAD":"dirham","MUR":"rupie","MRU":"ouguiya","HUF":"forint","MXN":"peso","MDL":"leu","MNT":"tugrik","MZN":"metical","MMK":"kyat","NAD":"dolar","NPR":"rupie","NGN":"naira","NIO":"córdoba","NOK":"koruna","NZD":"dolar","OMR":"rijál","PAB":"balboa","PGK":"kina","PYG":"guarani","PEN":"sol","PLN":"zlotý","PKR":"rupie","RON":"leu","RUB":"rubl","RWF":"frank","WST":"tala","SAR":"rijál","KPW":"won","MKD":"denár","SCR":"rupie","SLE":"leone","SGD":"dolar","SOS":"šilink","AED":"dirham","GBP":"libra","RSD":"dinár","LKR":"rupie","SRD":"dolar","STN":"dobra","SDG":"libra","SYP":"libra","TZS":"šilink","THB":"baht","TOP":"paanga","TTD":"dolar","TND":"dinár","TRY":"lira","TMT":"manat","TJS":"somoni","UGX":"šilink","UAH":"hřivna","UYU":"peso","UZS":"sum","VUV":"vatu","VES":"bolívar","VND":"dong","ZMW":"kwacha","ZWG":"zlato","AZN":"manat","IRR":"rijál","CZK":"koruna","CNY":"jüan","SBD":"dolar","SEK":"koruna"});
export function currencyLabel(currency: { code: CurrencyCode }): string {
  const label=CURRENCY_UNITS[currency.code];
  if(!label)throw new Error(`Chybí obecný název měny: ${currency.code}`);
  return label;
}
function candidateCountries(country: Country, all: Country[], difficulty: Difficulty, random: () => number): Country[] {
  const others=all.filter(c=>c.code!==country.code);
  const nearby=[...others].sort((a,b)=>distance(country,a)-distance(country,b));
  if(difficulty==='expert') return [...shuffle(nearby.slice(0,16),random),...shuffle(nearby.slice(16),random)];
  if(difficulty==='normal') return [...shuffle(others.filter(c=>c.region===country.region),random),...shuffle(others,random)];
  return shuffle(others,random);
}
function uniqueWrong(values: string[], answer: string, exclude: string[] = []): string[] {
  return [...new Set(values)].filter(v=>typeof v==='string'&&v.trim()&&v!==answer&&!exclude.includes(v));
}
export function makeQuestion(country: Country, type: QuestionKind, all: Country[], difficulty: Difficulty = 'normal', random: () => number = Math.random): BaseQuestion {
  if(![...TYPES,'flag'].includes(type)) throw new TypeError('Neznámá kategorie.');
  const candidates=candidateCountries(country,all,difficulty,random);
  let answer: string, prompt: string, wrong: string[], explanation: string, source='reference';
  if(type==='flag') {
    answer=country.name;prompt='Kterému státu patří tato vlajka?';
    wrong=candidates.filter(c=>!sameFlagFamily(country.code,c.code)).map(c=>c.name);
    explanation=`Toto je vlajka země ${country.name}.`;source='flags';
  } else if(type==='country') {
    answer=country.name; prompt='Který stát je zvýrazněný na glóbu?';
    wrong=candidates.map(c=>c.name);
    explanation=`Zvýrazněná země: ${country.name}. Oblast: ${REGIONS[country.region]}. Značka označuje polohu země, nikoli její hlavní město.`;
  } else if(type==='capital') {
    const special=SPECIAL_CAPITALS[country.code];
    // `validateCountries` rejects an empty `capital`, so index 0 is present.
    answer=special?special.answer:country.capital[0]!;
    prompt=special?special.question:'Jaké je hlavní město této země?';
    const excluded=[...country.capital,...(special?special.exclude:[]),...(country.code==='NL'?['Haag','The Hague']:[])];
    wrong=uniqueWrong(candidates.flatMap(c=>c.capital),answer,excluded);
    explanation= special ? `${answer}. ${country.note || ''}` : `Hlavní město: ${answer}.`;
    if(['GQ','BI','KZ','NL','MY','CI','EG'].includes(country.code)&&country.note) explanation+=` ${country.note}`;
  } else if(type==='currency') {
    // Compare monetary-unit families, not national adjectives or ISO codes.
    // Exclude ALL locally valid families to keep exactly one correct option.
    const chosen=country.currencyNames[0]!; answer=currencyLabel(chosen);
    const valid=country.currencyNames.map(currencyLabel);
    prompt=country.code==='ZW'?'Jak se zkráceně jmenuje domácí měna Zimbabwe?':'Který z těchto názvů označuje měnu oficiálně používanou v této zemi?';
    wrong=candidates.flatMap(c=>c.currencyNames).map(currencyLabel).filter(label=>!valid.includes(label));
    explanation=`Měna${country.currency.length>1?' (vybrané platné měny)':''}: ${country.currencyNames.map(c=>`${c.name} (${c.code})`).join(', ')}. V možnostech byl pouze obecný název bez země a kódu.`;
    if(['BG','ZW'].includes(country.code))explanation+=` ${country.note}`;
  } else if(type==='language') {
    // Distractors exclude every known widespread or official language of the target.
    // `validateCountries` pairs `languages` with `languageNames` one to one.
    const preferred=country.languages.map((code,i)=>({code,name:country.languageNames[i]!}));
    const selected=preferred[Math.floor(random()*preferred.length)]!;
    answer=selected.name; prompt='Který z těchto jazyků patří mezi hlavní nebo úřední jazyky této země?';
    wrong=candidates.flatMap(c=>c.languages.map((code,i)=>({code,name:c.languageNames[i]!})))
      .filter(l=>!country.excludeLanguages.includes(l.code)&&!country.languages.includes(l.code)).map(l=>l.name);
    explanation=`Vybrané hlavní nebo úřední jazyky: ${country.languageNames.join(', ')}. Jde o výběr, nikoli úplný výčet jazyků ani jejich právního postavení.`;
  } else {
    answer=populationLabel(country.population); prompt=`Kolik obyvatel má země přibližně podle projekce pro rok ${country.populationYear}?`;
    const factors=difficulty==='expert'?[0.55,0.72,1.38,1.8]:difficulty==='easy'?[0.2,0.4,2.5,5]:[0.35,0.6,1.7,3];
    // One distractor below and one above; randomize the correct position afterwards.
    const low=factors[Math.floor(random()*2)]!,high=factors[2+Math.floor(random()*2)]!;
    wrong=[populationLabel(Math.max(20,country.population*low)),populationLabel(country.population*high)];
    explanation=`Projekce ${country.populationYear}: ${country.population.toLocaleString('cs-CZ')} obyvatel (zaokrouhleně ${answer}). OSN WPP 2024, tabulka Worldometer; nejde o dnešní přesné sčítání. ${['CZ','FR','UA','TG'].includes(country.code)?country.note:''}`;
    source='worldometer-un-2026';
  }
  wrong=uniqueWrong(wrong,answer);
  if(wrong.length<2)throw new Error(`Nedostatek různých odpovědí: ${country.code}/${type}`);
  const options=shuffle([answer,...wrong.slice(0,2)],random);
  return {country:country.code,type,prompt,options,correct:options.indexOf(answer),explanation:explanation.trim(),source};
}
export function getPool(all: Country[], options: { region: RegionFilter; difficulty: Difficulty }): Country[] {
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
function nextCountry(game: GameState, all: Country[], random: () => number): Country | undefined {
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
  if(!Number.isSafeInteger(points)||points<0)throw new RangeError('Neplatná bodová odměna.');
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
function appendQuestion(game: GameState, all: Country[]): boolean {
  const random=rng((game.seed+Math.imul(game.questions.length+1,0x9e3779b9))>>>0);
  const next=nextTurn(game);if(next.kind==='end')return false;
  let country: Country|undefined,type: QuestionKind,anchor=next.anchor;
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
  if(!country)throw new Error('Pro tento režim chybí země.');
  // Every branch above has set `anchor`: two from the turn, one from the draw.
  const question: Question={...makeQuestion(country,type,all,game.options.difficulty,random),visit:next.visit,player:next.player,anchor:anchor!};
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
export function makeGame(all: Country[], options: GameOptions, seed: number = Math.floor(Math.random()*4294967295)): GameState {
  if(![1,2].includes(options.players))throw new RangeError('Počet hráčů musí být 1 nebo 2.');
  if(getPool(all,options).length<2)throw new Error('Pro vybraný režim není dost zemí.');
  const opts={...options,mode:'survival'};delete opts.visits;
  const game: GameState={version:7,seed:seed>>>0,revealedIndex:null,clock:null,options:opts,questions:[],index:0,answers:[],
    ...createEconomy(options.players),deck:[],recentFlags:[],cycles:0,created:new Date().toISOString(),completed:false,gameOver:false};
  appendQuestion(game,all);return game;
}
export const TIME_LIMITS: Readonly<Record<Difficulty, number>> = Object.freeze({easy:30000,normal:20000,expert:12000});
export const BASE_POINTS = 100, MAX_POINTS = 1000;
export function timeLimit(game: ProgressState): number {return game.review?0:(TIME_LIMITS[game.options.difficulty]||TIME_LIMITS.normal);}
export function pointsForTime(elapsedMs: number, limitMs: number): number {
  if(!Number.isFinite(elapsedMs)||elapsedMs<0||!Number.isFinite(limitMs)||limitMs<0)throw new RangeError('Neplatný čas odpovědi.');
  if(!limitMs)return 100;
  if(elapsedMs>=limitMs)return 0;
  return BASE_POINTS+Math.round((MAX_POINTS-BASE_POINTS)/10*(1-elapsedMs/limitMs))*10;
}
export function submit(game: ProgressState, selected: number | null, elapsedMs = 0): AnswerResult | null {
  if(game.completed||game.index>=game.questions.length||game.answers[game.index])return null;
  if(!Number.isFinite(elapsedMs)||elapsedMs<0)throw new RangeError('Neplatný čas odpovědi.');
  const limit=timeLimit(game),timedOut=limit>0&&elapsedMs>=limit;
  if(selected!==null&&(!Number.isInteger(selected)||selected<0||selected>2))throw new RangeError('Odpověď musí být 0, 1 nebo 2.');
  if(selected===null&&!timedOut)throw new RangeError('Čas ještě nevypršel.');
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
export function advance(game: GameState, all: Country[]): boolean {
  if(game.completed||!game.answers[game.index])return false;
  if(game.version===7&&!game.review){
    if(game.gameOver){game.completed=true;return false;}
    if(!Array.isArray(all))throw new TypeError('Pro pokračování je potřeba databáze.');
    if(!appendQuestion(game,all)){game.completed=true;return false;}
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
export function validateCountries(all: unknown): boolean {
  if(!Array.isArray(all)||all.length<3)throw new Error('Chybí databáze zemí.');
  const codes=new Set<string>();
  for(const c of all){
    if(!/^[A-Z]{2}$/.test(c.code)||codes.has(c.code))throw new Error(`Neplatný či duplicitní kód: ${c.code}`);
    codes.add(c.code);
    for(const key of ['capital','currency','currencyNames','languages','languageNames','excludeLanguages'])if(!Array.isArray(c[key])||!c[key].length)throw new Error(`${c.code}: chybí ${key}`);
    if(c.languages.length!==c.languageNames.length)throw new Error('Nesouhlasí jazyky.');
    if(!Number.isFinite(c.lat)||Math.abs(c.lat)>90||!Number.isFinite(c.lon)||Math.abs(c.lon)>180)throw new Error('Neplatná poloha.');
    if(!Number.isSafeInteger(c.population)||c.population<=0)throw new Error('Neplatné obyvatelstvo.');
    if(!REGIONS[c.region as Region])throw new Error(`Neznámý region: ${c.code}`);
  }
  return true;
}
