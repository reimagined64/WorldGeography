/* Pure quiz logic. No DOM, network, or mutable country data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GeoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TYPES = ['country', 'capital', 'currency', 'language', 'population'];
  const LABELS = {country:'Stát',capital:'Hlavní město',currency:'Měna',language:'Jazyk',population:'Obyvatelstvo',flag:'Vlajkový bonus'};
  const REGIONS = {'Europe':'Evropa','Asia':'Asie','Africa':'Afrika','North America':'Severní Amerika','South America':'Jižní Amerika','Oceania':'Oceánie'};
  const SPECIAL_CAPITALS = {
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
  function rng(seed) { let a = seed >>> 0; return function () { a += 0x6D2B79F5; let t=a; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
  function shuffle(items, random=Math.random) { const a=[...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
  function distance(a,b) { const r=Math.PI/180,lat1=a.lat*r,lat2=b.lat*r,dl=(a.lon-b.lon)*r; return Math.acos(Math.max(-1,Math.min(1,Math.sin(lat1)*Math.sin(lat2)+Math.cos(lat1)*Math.cos(lat2)*Math.cos(dl)))); }
  function populationLabel(n) {
    if (!Number.isFinite(n) || n <= 0) throw new TypeError('Neplatný počet obyvatel.');
    if(n>=1e9) return `${(Math.round(n/1e7)/100).toLocaleString('cs-CZ')} mld.`;
    if(n>=1e6) return `${(Math.round(n/1e5)/10).toLocaleString('cs-CZ')} mil.`;
    if(n>=1000) return `${Math.round(n/1000).toLocaleString('cs-CZ')} tis.`;
    return `${Math.round(n/10)*10}`;
  }
  const CURRENCY_UNITS=Object.freeze({"AFN":"afghán","ALL":"lek","DZD":"dinár","EUR":"euro","AOA":"kwanza","XCD":"dolar","ARS":"peso","AMD":"dram","AUD":"dolar","BSD":"dolar","BHD":"dinár","BDT":"taka","BBD":"dolar","BZD":"dolar","XOF":"frank","BTN":"ngultrum","INR":"rupie","BOB":"boliviano","BAM":"marka","BWP":"pula","BRL":"real","BND":"dolar","BIF":"frank","BYN":"rubl","CLP":"peso","CDF":"frank","DOP":"peso","DKK":"koruna","DJF":"frank","EGP":"libra","USD":"dolar","ERN":"nakfa","SZL":"lilangeni","ZAR":"rand","ETB":"birr","FJD":"dolar","PHP":"peso","XAF":"frank","GMD":"dalasi","GHS":"cedi","GEL":"lari","GTQ":"quetzal","GNF":"frank","GYD":"dolar","HTG":"gourde","HNL":"lempira","IDR":"rupie","IQD":"dinár","ISK":"koruna","ILS":"šekel","JMD":"dolar","JPY":"jen","YER":"rijál","KRW":"won","SSP":"libra","JOD":"dinár","KHR":"riel","CAD":"dolar","CVE":"escudo","QAR":"rijál","KZT":"tenge","KES":"šilink","COP":"peso","KMF":"frank","CRC":"colón","CUP":"peso","KWD":"dinár","KGS":"som","LAK":"kip","LSL":"loti","LBP":"libra","LYD":"dinár","LRD":"dolar","CHF":"frank","MGA":"ariary","MYR":"ringgit","MWK":"kwacha","MVR":"rupie","MAD":"dirham","MUR":"rupie","MRU":"ouguiya","HUF":"forint","MXN":"peso","MDL":"leu","MNT":"tugrik","MZN":"metical","MMK":"kyat","NAD":"dolar","NPR":"rupie","NGN":"naira","NIO":"córdoba","NOK":"koruna","NZD":"dolar","OMR":"rijál","PAB":"balboa","PGK":"kina","PYG":"guarani","PEN":"sol","PLN":"zlotý","PKR":"rupie","RON":"leu","RUB":"rubl","RWF":"frank","WST":"tala","SAR":"rijál","KPW":"won","MKD":"denár","SCR":"rupie","SLE":"leone","SGD":"dolar","SOS":"šilink","AED":"dirham","GBP":"libra","RSD":"dinár","LKR":"rupie","SRD":"dolar","STN":"dobra","SDG":"libra","SYP":"libra","TZS":"šilink","THB":"baht","TOP":"paanga","TTD":"dolar","TND":"dinár","TRY":"lira","TMT":"manat","TJS":"somoni","UGX":"šilink","UAH":"hřivna","UYU":"peso","UZS":"sum","VUV":"vatu","VES":"bolívar","VND":"dong","ZMW":"kwacha","ZWG":"zlato","AZN":"manat","IRR":"rijál","CZK":"koruna","CNY":"jüan","SBD":"dolar","SEK":"koruna"});
  function currencyLabel(currency){
    const label=CURRENCY_UNITS[currency.code];
    if(!label)throw new Error(`Chybí obecný název měny: ${currency.code}`);
    return label;
  }
  function candidateCountries(country, all, difficulty, random) {
    const others=all.filter(c=>c.code!==country.code);
    const nearby=[...others].sort((a,b)=>distance(country,a)-distance(country,b));
    if(difficulty==='expert') return [...shuffle(nearby.slice(0,16),random),...shuffle(nearby.slice(16),random)];
    if(difficulty==='normal') return [...shuffle(others.filter(c=>c.region===country.region),random),...shuffle(others,random)];
    return shuffle(others,random);
  }
  function uniqueWrong(values, answer, exclude=[]) {
    return [...new Set(values)].filter(v=>typeof v==='string'&&v.trim()&&v!==answer&&!exclude.includes(v));
  }
  function makeQuestion(country,type,all,difficulty='normal',random=Math.random) {
    if(![...TYPES,'flag'].includes(type)) throw new TypeError('Neznámá kategorie.');
    const candidates=candidateCountries(country,all,difficulty,random);
    let answer, prompt, wrong, explanation, source='reference';
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
      answer=special?special.answer:country.capital[0];
      prompt=special?special.question:'Jaké je hlavní město této země?';
      const excluded=[...country.capital,...(special?special.exclude:[]),...(country.code==='NL'?['Haag','The Hague']:[])];
      wrong=uniqueWrong(candidates.flatMap(c=>c.capital),answer,excluded);
      explanation= special ? `${answer}. ${country.note || ''}` : `Hlavní město: ${answer}.`;
      if(['GQ','BI','KZ','NL','MY','CI','EG'].includes(country.code)&&country.note) explanation+=` ${country.note}`;
    } else if(type==='currency') {
      // Compare monetary-unit families, not national adjectives or ISO codes.
      // Exclude ALL locally valid families to keep exactly one correct option.
      const chosen=country.currencyNames[0]; answer=currencyLabel(chosen);
      const valid=country.currencyNames.map(currencyLabel);
      prompt=country.code==='ZW'?'Jak se zkráceně jmenuje domácí měna Zimbabwe?':'Který z těchto názvů označuje měnu oficiálně používanou v této zemi?';
      wrong=candidates.flatMap(c=>c.currencyNames).map(currencyLabel).filter(label=>!valid.includes(label));
      explanation=`Měna${country.currency.length>1?' (vybrané platné měny)':''}: ${country.currencyNames.map(c=>`${c.name} (${c.code})`).join(', ')}. V možnostech byl pouze obecný název bez země a kódu.`;
      if(['BG','ZW'].includes(country.code))explanation+=` ${country.note}`;
    } else if(type==='language') {
      // Distractors exclude every known widespread or official language of the target.
      const preferred=country.languages.map((code,i)=>({code,name:country.languageNames[i]}));
      const selected=preferred[Math.floor(random()*preferred.length)];
      answer=selected.name; prompt='Který z těchto jazyků patří mezi hlavní nebo úřední jazyky této země?';
      wrong=candidates.flatMap(c=>c.languages.map((code,i)=>({code,name:c.languageNames[i]})))
        .filter(l=>!country.excludeLanguages.includes(l.code)&&!country.languages.includes(l.code)).map(l=>l.name);
      explanation=`Vybrané hlavní nebo úřední jazyky: ${country.languageNames.join(', ')}. Jde o výběr, nikoli úplný výčet jazyků ani jejich právního postavení.`;
    } else {
      answer=populationLabel(country.population); prompt=`Kolik obyvatel má země přibližně podle projekce pro rok ${country.populationYear}?`;
      const factors=difficulty==='expert'?[0.55,0.72,1.38,1.8]:difficulty==='easy'?[0.2,0.4,2.5,5]:[0.35,0.6,1.7,3];
      // One distractor below and one above; randomize the correct position afterwards.
      const low=factors[Math.floor(random()*2)],high=factors[2+Math.floor(random()*2)];
      wrong=[populationLabel(Math.max(20,country.population*low)),populationLabel(country.population*high)];
      explanation=`Projekce ${country.populationYear}: ${country.population.toLocaleString('cs-CZ')} obyvatel (zaokrouhleně ${answer}). OSN WPP 2024, tabulka Worldometer; nejde o dnešní přesné sčítání. ${['CZ','FR','UA','TG'].includes(country.code)?country.note:''}`;
      source='worldometer-un-2026';
    }
    wrong=uniqueWrong(wrong,answer);
    if(wrong.length<2)throw new Error(`Nedostatek různých odpovědí: ${country.code}/${type}`);
    const options=shuffle([answer,...wrong.slice(0,2)],random);
    return {country:country.code,type,prompt,options,correct:options.indexOf(answer),explanation:explanation.trim(),source};
  }
  function getPool(all,options) {
    return all.filter(c=>(options.region==='all'||c.region===options.region)&&(options.difficulty!=='easy'||c.easy));
  }
  const INITIAL_LIVES=5;
  const BONUS_INTERVAL=10000;
  const MILESTONE_LIVES=2;
  // These near-identical flag pairs are not used as distractors for one another.
  // Afghanistan's conventional emoji tricolour is documented in the atlas, not quizzed.
  const FLAG_FAMILIES=[['ID','MC'],['RO','TD'],['NL','LU'],['IE','CI'],['AU','NZ']];
  function sameFlagFamily(a,b){return FLAG_FAMILIES.some(group=>group.includes(a)&&group.includes(b));}
  function livePlayer(game,after){
    for(let n=1;n<=game.lives.length;n++){const p=(after+n)%game.lives.length;if(game.lives[p]>0)return p;}
    return -1;
  }
  function nextCountry(game,all,random){
    const pool=getPool(all,game.options);
    if(!Array.isArray(game.deck)||!game.deck.length){
      game.deck=shuffle(pool.map(c=>c.code),random);
      if(game.deck.length>1&&game.deck[0]===game.lastCountry)[game.deck[0],game.deck[1]]=[game.deck[1],game.deck[0]];
      game.cycles=(game.cycles||0)+1;
    }
    const code=game.deck.shift();game.lastCountry=code;
    return all.find(c=>c.code===code);
  }
  function nextBonusThreshold(game,player) {
    return ((game.bonusMilestones?.[player]||0)+1)*BONUS_INTERVAL;
  }
  // Shared by actual gameplay, save validation and the seeded balance simulator.
  function createEconomy(players=1){
    const zeros=()=>Array(players).fill(0);
    return {scores:zeros(),lives:Array(players).fill(INITIAL_LIVES),earnedLives:zeros(),scoreLives:zeros(),flagLives:zeros(),
      bonusMilestones:zeros(),bonusIssued:zeros(),pendingBonuses:Array.from({length:players},()=>[]),countriesPlayed:zeros()};
  }
  function spendCountryAttempt(game,player){
    if(!(game.lives[player]>0))return false;
    game.lives[player]--;game.countriesPlayed[player]++;return true;
  }
  function awardPoints(game,player,points){
    if(!Number.isSafeInteger(points)||points<0)throw new RangeError('Neplatná bodová odměna.');
    game.scores[player]+=points;
    const earned=Math.floor(game.scores[player]/BONUS_INTERVAL),previous=game.bonusMilestones[player];
    const thresholds=[];
    for(let milestone=previous+1;milestone<=earned;milestone++){
      const threshold=milestone*BONUS_INTERVAL;
      thresholds.push(threshold);game.pendingBonuses[player].push(threshold);
    }
    const gained=(earned-previous)*MILESTONE_LIVES;
    game.bonusMilestones[player]=earned;game.lives[player]+=gained;
    game.earnedLives[player]+=gained;game.scoreLives[player]+=gained;
    return thresholds;
  }
  function awardFlagAttempt(game,player){
    game.lives[player]++;game.earnedLives[player]++;game.flagLives[player]++;
  }
  function consumeBonus(game,player){
    if(!game.pendingBonuses[player].length)return null;
    game.bonusIssued[player]++;return game.pendingBonuses[player].shift();
  }
  function nextTurn(game) {
    if(game.completed||game.gameOver)return {kind:'end'};
    const previous=game.questions.at(-1);
    if(!previous)return {kind:'country',player:0,visit:0};
    const player=previous.player;
    const regular=previous.type==='flag'?game.questions[previous.regularIndex]:previous;
    // A country was paid for at entry. All five questions remain playable at zero
    // reserve attempts, including a chance to earn a rescue threshold.
    if(regular&&regular.player===player){
      const step=TYPES.indexOf(regular.type)+1;
      if(step<TYPES.length)return {kind:'question',player,visit:regular.visit,anchor:regular.country,type:TYPES[step]};
    }
    // Flags are queued, never interrupt the current country and cost no attempt.
    if(game.pendingBonuses[player].length)
      return {kind:'bonus',player,visit:previous.visit,anchor:previous.anchor||previous.country,
        regularIndex:previous.type==='flag'?previous.regularIndex:game.questions.length-1,
        threshold:game.pendingBonuses[player][0]};
    const next=livePlayer(game,player);
    return next<0?{kind:'end'}:{kind:'country',player:next,visit:previous.visit+1};
  }
  function needsFlight(game) {
    const q=game.questions[game.index];if(!q)return false;
    if(!game.review)return q.type==='country'||q.type==='flag';
    if(q.type==='flag')return true;
    const previous=game.questions[game.index-1];
    return !previous||previous.type==='flag'||previous.country!==q.country;
  }
  function appendQuestion(game,all) {
    const random=rng((game.seed+Math.imul(game.questions.length+1,0x9e3779b9))>>>0);
    const next=nextTurn(game);if(next.kind==='end')return false;
    let country,type,anchor=next.anchor;
    if(next.kind==='bonus') {
      const recent=game.recentFlags||[];
      let pool=getPool(all,game.options).filter(c=>c.code!==anchor&&c.code!=='AF'&&!recent.includes(c.code));
      if(!pool.length)pool=getPool(all,game.options).filter(c=>c.code!==anchor&&c.code!=='AF');
      country=pool[Math.floor(random()*pool.length)];type='flag';
    } else if(next.kind==='question') {
      country=all.find(c=>c.code===anchor);type=next.type;
    } else {
      country=nextCountry(game,all,random);type=TYPES[0];anchor=country.code;
    }
    if(!country)throw new Error('Pro tento režim chybí země.');
    const question={...makeQuestion(country,type,all,game.options.difficulty,random),visit:next.visit,player:next.player,anchor};
    if(next.kind==='bonus') {
      question.bonusThreshold=consumeBonus(game,next.player);question.regularIndex=next.regularIndex;
      game.recentFlags=[...(game.recentFlags||[]),country.code].slice(-6);
    }else if(next.kind==='country'){
      question.livesBeforeCountry=game.lives[next.player];question.countryCost=1;
      if(!spendCountryAttempt(game,next.player))return false;
    }
    game.questions.push(question);return true;
  }
  function makeGame(all,options,seed=Math.floor(Math.random()*4294967295)) {
    if(![1,2].includes(options.players))throw new RangeError('Počet hráčů musí být 1 nebo 2.');
    if(getPool(all,options).length<2)throw new Error('Pro vybraný režim není dost zemí.');
    const opts={...options,mode:'survival'};delete opts.visits;
    const game={version:7,seed:seed>>>0,revealedIndex:null,clock:null,options:opts,questions:[],index:0,answers:[],
      ...createEconomy(options.players),deck:[],recentFlags:[],cycles:0,created:new Date().toISOString(),completed:false,gameOver:false};
    appendQuestion(game,all);return game;
  }
  const TIME_LIMITS=Object.freeze({easy:30000,normal:20000,expert:12000});
  const BASE_POINTS=100,MAX_POINTS=1000;
  function timeLimit(game){return game.review?0:(TIME_LIMITS[game.options.difficulty]||TIME_LIMITS.normal);}
  function pointsForTime(elapsedMs,limitMs){
    if(!Number.isFinite(elapsedMs)||elapsedMs<0||!Number.isFinite(limitMs)||limitMs<0)throw new RangeError('Neplatný čas odpovědi.');
    if(!limitMs)return 100;
    if(elapsedMs>=limitMs)return 0;
    return BASE_POINTS+Math.round((MAX_POINTS-BASE_POINTS)/10*(1-elapsedMs/limitMs))*10;
  }
  function submit(game,selected,elapsedMs=0) {
    if(game.completed||game.index>=game.questions.length||game.answers[game.index])return null;
    if(!Number.isFinite(elapsedMs)||elapsedMs<0)throw new RangeError('Neplatný čas odpovědi.');
    const limit=timeLimit(game),timedOut=limit>0&&elapsedMs>=limit;
    if(selected!==null&&(!Number.isInteger(selected)||selected<0||selected>2))throw new RangeError('Odpověď musí být 0, 1 nebo 2.');
    if(selected===null&&!timedOut)throw new RangeError('Čas ještě nevypršel.');
    const q=game.questions[game.index],correct=!timedOut&&selected===q.correct;
    const points=correct?pointsForTime(elapsedMs,limit):0,basePoints=correct?(limit?BASE_POINTS:100):0;
    const result={selected:timedOut?null:selected,correct,points,basePoints,bonusPoints:points-basePoints,
      elapsedMs:limit?Math.min(elapsedMs,limit):elapsedMs,timeLimitMs:limit,timedOut,player:q.player};
    if(game.version===7&&!game.review){
      const before=game.lives[q.player];
      const thresholds=awardPoints(game,q.player,points),flagLife=q.type==='flag'&&correct?1:0;
      if(flagLife)awardFlagAttempt(game,q.player);
      Object.assign(result,{lifeDelta:thresholds.length*MILESTONE_LIVES+flagLife,scoreLifeDelta:thresholds.length*MILESTONE_LIVES,flagLifeDelta:flagLife,
        milestoneThresholds:thresholds,livesBefore:before,livesAfter:game.lives[q.player],isFlagBonus:q.type==='flag'});
    }else game.scores[q.player]+=points;
    game.answers[game.index]=result;
    // Elimination is considered only after the paid country AND pending flags.
    if(game.version===7&&!game.review)game.gameOver=nextTurn(game).kind==='end';
    return result;
  }
  function advance(game,all) {
    if(game.completed||!game.answers[game.index])return false;
    if(game.version===7&&!game.review){
      if(game.gameOver){game.completed=true;return false;}
      if(!Array.isArray(all))throw new TypeError('Pro pokračování je potřeba databáze.');
      if(!appendQuestion(game,all)){game.completed=true;return false;}
    }else if(game.index===game.questions.length-1){game.completed=true;return false;}
    game.index++;game.clock=null;game.revealedIndex=null;return true;
  }
  // Replaying ledger entries validates saves without regenerating random maps or
  // distractors. It also prevents double-charging a country after resume.
  function validateProgress(game){
    try{
      if(game.version!==7)return false;
      const replay={version:7,options:game.options,questions:[],answers:[],index:0,completed:false,gameOver:false,...createEconomy(game.options.players)};
      for(let i=0;i<game.questions.length;i++){
        const q=game.questions[i],answer=game.answers[i],next=nextTurn(replay);
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
          if(!expected||Object.keys(expected).some(key=>JSON.stringify(expected[key])!==JSON.stringify(answer[key])))return false;
        }else if(i!==game.questions.length-1)return false;
      }
      return Object.keys(createEconomy(game.options.players)).every(key=>JSON.stringify(replay[key])===JSON.stringify(game[key]))&&replay.gameOver===game.gameOver;
    }catch{return false;}
  }
  function validateCountries(all) {
    if(!Array.isArray(all)||all.length<3)throw new Error('Chybí databáze zemí.');
    const codes=new Set();
    for(const c of all){
      if(!/^[A-Z]{2}$/.test(c.code)||codes.has(c.code))throw new Error(`Neplatný či duplicitní kód: ${c.code}`);
      codes.add(c.code);
      for(const key of ['capital','currency','currencyNames','languages','languageNames','excludeLanguages'])if(!Array.isArray(c[key])||!c[key].length)throw new Error(`${c.code}: chybí ${key}`);
      if(c.languages.length!==c.languageNames.length)throw new Error('Nesouhlasí jazyky.');
      if(!Number.isFinite(c.lat)||Math.abs(c.lat)>90||!Number.isFinite(c.lon)||Math.abs(c.lon)>180)throw new Error('Neplatná poloha.');
      if(!Number.isSafeInteger(c.population)||c.population<=0)throw new Error('Neplatné obyvatelstvo.');
      if(!REGIONS[c.region])throw new Error(`Neznámý region: ${c.code}`);
    }
    return true;
  }
  return {TYPES,LABELS,REGIONS,TIME_LIMITS,INITIAL_LIVES,BONUS_INTERVAL,MILESTONE_LIVES,BASE_POINTS,MAX_POINTS,CURRENCY_UNITS,currencyLabel,createEconomy,spendCountryAttempt,awardPoints,awardFlagAttempt,consumeBonus,validateProgress,nextBonusThreshold,nextTurn,needsFlight,sameFlagFamily,timeLimit,pointsForTime,rng,shuffle,populationLabel,makeQuestion,makeGame,submit,advance,getPool,validateCountries};
});
