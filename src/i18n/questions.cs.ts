/**
 * Every Czech string a question says out loud.
 *
 * Lifted verbatim out of `engine/core.ts`, which wrote its own prompts,
 * explanations, currency units and special-capital table until U12. Not one
 * character moved: `questions-golden.json` records all 14,040 Czech variants
 * and would notice a changed comma.
 *
 * The six region names are read out of `cs.ts` rather than repeated. Before
 * this unit the engine and the shell each spelled them, and they could have
 * disagreed; now the shell's copy is the only copy and this is a reference to
 * it.
 */
import type { QuestionBundle, Region } from '../engine/types.ts';
import { cs } from './cs.ts';

const regions: Readonly<Record<Region, string>> = {
  Europe: cs['region.Europe'],
  Asia: cs['region.Asia'],
  Africa: cs['region.Africa'],
  'North America': cs['region.North America'],
  'South America': cs['region.South America'],
  Oceania: cs['region.Oceania'],
};

/**
 * The monetary unit, stripped of nationality — "dolar", never "americký dolar".
 *
 * Eighteen dollars share one entry, nine francs another. That collapsing is
 * load-bearing: the distractor filter compares these strings, so two countries
 * whose currency is the same unit can never be offered as alternatives to each
 * other. `questions.en.ts` partitions the same 142 codes exactly the same way,
 * and `locale-integrity.test.ts` proves it code pair by code pair.
 */
const currencyUnits: Readonly<Record<string, string>> = Object.freeze({"AFN":"afghán","ALL":"lek","DZD":"dinár","EUR":"euro","AOA":"kwanza","XCD":"dolar","ARS":"peso","AMD":"dram","AUD":"dolar","BSD":"dolar","BHD":"dinár","BDT":"taka","BBD":"dolar","BZD":"dolar","XOF":"frank","BTN":"ngultrum","INR":"rupie","BOB":"boliviano","BAM":"marka","BWP":"pula","BRL":"real","BND":"dolar","BIF":"frank","BYN":"rubl","CLP":"peso","CDF":"frank","DOP":"peso","DKK":"koruna","DJF":"frank","EGP":"libra","USD":"dolar","ERN":"nakfa","SZL":"lilangeni","ZAR":"rand","ETB":"birr","FJD":"dolar","PHP":"peso","XAF":"frank","GMD":"dalasi","GHS":"cedi","GEL":"lari","GTQ":"quetzal","GNF":"frank","GYD":"dolar","HTG":"gourde","HNL":"lempira","IDR":"rupie","IQD":"dinár","ISK":"koruna","ILS":"šekel","JMD":"dolar","JPY":"jen","YER":"rijál","KRW":"won","SSP":"libra","JOD":"dinár","KHR":"riel","CAD":"dolar","CVE":"escudo","QAR":"rijál","KZT":"tenge","KES":"šilink","COP":"peso","KMF":"frank","CRC":"colón","CUP":"peso","KWD":"dinár","KGS":"som","LAK":"kip","LSL":"loti","LBP":"libra","LYD":"dinár","LRD":"dolar","CHF":"frank","MGA":"ariary","MYR":"ringgit","MWK":"kwacha","MVR":"rupie","MAD":"dirham","MUR":"rupie","MRU":"ouguiya","HUF":"forint","MXN":"peso","MDL":"leu","MNT":"tugrik","MZN":"metical","MMK":"kyat","NAD":"dolar","NPR":"rupie","NGN":"naira","NIO":"córdoba","NOK":"koruna","NZD":"dolar","OMR":"rijál","PAB":"balboa","PGK":"kina","PYG":"guarani","PEN":"sol","PLN":"zlotý","PKR":"rupie","RON":"leu","RUB":"rubl","RWF":"frank","WST":"tala","SAR":"rijál","KPW":"won","MKD":"denár","SCR":"rupie","SLE":"leone","SGD":"dolar","SOS":"šilink","AED":"dirham","GBP":"libra","RSD":"dinár","LKR":"rupie","SRD":"dolar","STN":"dobra","SDG":"libra","SYP":"libra","TZS":"šilink","THB":"baht","TOP":"paanga","TTD":"dolar","TND":"dinár","TRY":"lira","TMT":"manat","TJS":"somoni","UGX":"šilink","UAH":"hřivna","UYU":"peso","UZS":"sum","VUV":"vatu","VES":"bolívar","VND":"dong","ZMW":"kwacha","ZWG":"zlato","AZN":"manat","IRR":"rijál","CZK":"koruna","CNY":"jüan","SBD":"dolar","SEK":"koruna"});

/**
 * The eleven capitals the ordinary question cannot ask about.
 *
 * Ten are asked differently, because the honest question is not "what is the
 * capital" — Bern is a seat of government, Sucre a constitutional capital,
 * Nusantara a building site. The eleventh, `NL`, is asked the ordinary way and
 * carries only an exclusion: The Hague is where the Dutch government sits and
 * would read as a second correct answer. It was an inline `country.code ===
 * 'NL'` test in v7's `makeQuestion`; folding it in here is what makes the
 * per-locale exclusion complete.
 */
const specialCapitals: Readonly<Record<string, QuestionBundle<'cs'>['specialCapitals'][string]>> = {
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
  NL:{exclude:['Haag','The Hague']},
};

export const csQuestions: QuestionBundle<'cs'> = {
  locale: 'cs',
  numberLocale: 'cs-CZ',
  regions,
  currencyUnits,
  magnitudes: { billion: 'mld.', million: 'mil.', thousand: 'tis.' },
  specialCapitals,
  currencyPrompts: { ZW: 'Jak se zkráceně jmenuje domácí měna Zimbabwe?' },
  provenance: {
    unWpp: 'OSN WPP 2024, střední varianta',
    worldometer: 'OSN WPP 2024, tabulka Worldometer',
    fallback: 'OSN WPP 2024',
  },
  prompts: {
    flag: 'Kterému státu patří tato vlajka?',
    country: 'Který stát je zvýrazněný na glóbu?',
    capital: 'Jaké je hlavní město této země?',
    currency: 'Který z těchto názvů označuje měnu oficiálně používanou v této zemi?',
    language: 'Který z těchto jazyků patří mezi hlavní nebo úřední jazyky této země?',
    population: 'Kolik obyvatel má země přibližně podle projekce pro rok {year}?',
  },
  explanations: {
    flag: 'Toto je vlajka země {name}.',
    country: 'Zvýrazněná země: {name}. Oblast: {region}. Značka označuje polohu země, nikoli její hlavní město.',
    capital: 'Hlavní město: {capital}.',
    capitalSpecial: '{capital}. {note}',
    currency: 'Měna: {units}. V možnostech byl pouze obecný název bez země a kódu.',
    currencyMultiple: 'Měna (vybrané platné měny): {units}. V možnostech byl pouze obecný název bez země a kódu.',
    language: 'Vybrané hlavní nebo úřední jazyky: {names}. Jde o výběr, nikoli úplný výčet jazyků ani jejich právního postavení.',
    population: 'Projekce {year}: {count} obyvatel (zaokrouhleně {rounded}). {provenance}; nejde o dnešní přesné sčítání. {note}',
  },
  errors: {
    unknownKind: 'Neznámá kategorie.',
    missingCurrencyUnit: 'Chybí obecný název měny: {code}',
    invalidPopulation: 'Neplatný počet obyvatel.',
    notEnoughAnswers: 'Nedostatek různých odpovědí: {code}/{type}',
    noCountries: 'Pro tento režim chybí země.',
    players: 'Počet hráčů musí být 1 nebo 2.',
    poolTooSmall: 'Pro vybraný režim není dost zemí.',
    databaseMissing: 'Chybí databáze zemí.',
    badCode: 'Neplatný či duplicitní kód: {code}',
    missingField: '{code}: chybí {field}',
    languageMismatch: 'Nesouhlasí jazyky.',
    badPosition: 'Neplatná poloha.',
    badPopulation: 'Neplatné obyvatelstvo.',
    unknownRegion: 'Neznámý region: {code}',
  },
};
