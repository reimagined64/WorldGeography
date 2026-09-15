/**
 * Every English string a question says out loud.
 *
 * Authored against the Czech rather than translated from it. Three of the
 * tables here feed string-equality distractor filtering — the currency units,
 * the special-capital exclusions and the magnitude words — and a list that is
 * merely a plausible rendering of the Czech one produces a question with two
 * correct answers (R18). Each is written below against the English the dataset
 * actually holds.
 *
 * The phrasing follows the Czech constructions on purpose: appositives and
 * colons — "Highlighted country: Chad." — rather than sentences that would put
 * a country name in a possessive or a preposition. A country name interpolated
 * into a template is never inflected in either language, which is what lets one
 * template serve all 195.
 */
import type { QuestionBundle, Region } from '../engine/types.ts';
import { en } from './en.ts';

const regions: Readonly<Record<Region, string>> = {
  Europe: en['region.Europe'] as string,
  Asia: en['region.Asia'] as string,
  Africa: en['region.Africa'] as string,
  'North America': en['region.North America'] as string,
  'South America': en['region.South America'] as string,
  Oceania: en['region.Oceania'] as string,
};

/**
 * The same 142 codes as `questions.cs.ts`, partitioned exactly the same way.
 *
 * Generated from the Czech table by replacing each of its 74 unit words with
 * one English word, so two codes share an entry here if and only if they share
 * one there. That is not a tidiness rule: the filter that keeps a second
 * correct answer out of a currency question is string equality over these
 * values, so a partition that differs between locales is a partition that is
 * wrong in one of them.
 *
 * "crown" for the five korunas is the one entry that trades the usual English
 * loanword for the literal one. Keeping koruna, krone, krona, króna and koruna
 * apart would split one family into four, and Denmark's question would then be
 * free to offer Norway's krone as a wrong answer.
 */
const currencyUnits: Readonly<Record<string, string>> = Object.freeze({"AFN":"afghani","ALL":"lek","DZD":"dinar","EUR":"euro","AOA":"kwanza","XCD":"dollar","ARS":"peso","AMD":"dram","AUD":"dollar","BSD":"dollar","BHD":"dinar","BDT":"taka","BBD":"dollar","BZD":"dollar","XOF":"franc","BTN":"ngultrum","INR":"rupee","BOB":"boliviano","BAM":"mark","BWP":"pula","BRL":"real","BND":"dollar","BIF":"franc","BYN":"ruble","CLP":"peso","CDF":"franc","DOP":"peso","DKK":"crown","DJF":"franc","EGP":"pound","USD":"dollar","ERN":"nakfa","SZL":"lilangeni","ZAR":"rand","ETB":"birr","FJD":"dollar","PHP":"peso","XAF":"franc","GMD":"dalasi","GHS":"cedi","GEL":"lari","GTQ":"quetzal","GNF":"franc","GYD":"dollar","HTG":"gourde","HNL":"lempira","IDR":"rupee","IQD":"dinar","ISK":"crown","ILS":"shekel","JMD":"dollar","JPY":"yen","YER":"rial","KRW":"won","SSP":"pound","JOD":"dinar","KHR":"riel","CAD":"dollar","CVE":"escudo","QAR":"rial","KZT":"tenge","KES":"shilling","COP":"peso","KMF":"franc","CRC":"colón","CUP":"peso","KWD":"dinar","KGS":"som","LAK":"kip","LSL":"loti","LBP":"pound","LYD":"dinar","LRD":"dollar","CHF":"franc","MGA":"ariary","MYR":"ringgit","MWK":"kwacha","MVR":"rupee","MAD":"dirham","MUR":"rupee","MRU":"ouguiya","HUF":"forint","MXN":"peso","MDL":"leu","MNT":"tugrik","MZN":"metical","MMK":"kyat","NAD":"dollar","NPR":"rupee","NGN":"naira","NIO":"córdoba","NOK":"crown","NZD":"dollar","OMR":"rial","PAB":"balboa","PGK":"kina","PYG":"guaraní","PEN":"sol","PLN":"zloty","PKR":"rupee","RON":"leu","RUB":"ruble","RWF":"franc","WST":"tala","SAR":"rial","KPW":"won","MKD":"denar","SCR":"rupee","SLE":"leone","SGD":"dollar","SOS":"shilling","AED":"dirham","GBP":"pound","RSD":"dinar","LKR":"rupee","SRD":"dollar","STN":"dobra","SDG":"pound","SYP":"pound","TZS":"shilling","THB":"baht","TOP":"paʻanga","TTD":"dollar","TND":"dinar","TRY":"lira","TMT":"manat","TJS":"somoni","UGX":"shilling","UAH":"hryvnia","UYU":"peso","UZS":"sum","VUV":"vatu","VES":"bolívar","VND":"dong","ZMW":"kwacha","ZWG":"gold","AZN":"manat","IRR":"rial","CZK":"crown","CNY":"yuan","SBD":"dollar","SEK":"crown"});

/**
 * The eleven capitals the ordinary question cannot ask about, in English.
 *
 * Every `exclude` entry is spelled the way `data/build/countries.json` spells
 * it in English — "Cape Town", not "Kapské Město" — because that is the string
 * the filter compares. The Netherlands entry carries only "The Hague": the
 * Czech list also holds "Haag", which is the Dutch spelling a Czech reader
 * might meet and is not a name anything in the English data uses.
 */
const specialCapitals: Readonly<Record<string, QuestionBundle<'en'>['specialCapitals'][string]>> = {
  ID:{question:'What is the name of the new capital Indonesia is building?',answer:'Nusantara',exclude:['Jakarta']},
  PS:{question:'Which city is the administrative seat of the Palestinian Authority?',answer:'Ramallah',exclude:['East Jerusalem (claimed)','Jerusalem']},
  IL:{question:'In which city does the Israeli parliament, the Knesset, sit?',answer:'Jerusalem',exclude:[]},
  YE:{question:'Which city is the constitutional capital of Yemen?',answer:'Sanaa',exclude:['Aden']},
  CH:{question:'Which city is the seat of the Swiss federal government?',answer:'Bern',exclude:[]},
  NR:{question:'In which district does the government of Nauru sit?',answer:'Yaren',exclude:['Yaren (seat of government)']},
  ZA:{question:'Which city is the executive capital of South Africa?',answer:'Pretoria',exclude:['Cape Town','Bloemfontein','Johannesburg']},
  SZ:{question:'Which city is the administrative capital of Eswatini?',answer:'Mbabane',exclude:['Lobamba']},
  BO:{question:'Which city is the constitutional capital of Bolivia?',answer:'Sucre',exclude:['La Paz']},
  LK:{question:'In which city does the parliament of Sri Lanka sit?',answer:'Sri Jayawardenepura Kotte',exclude:['Colombo']},
  NL:{exclude:['The Hague']},
};

export const enQuestions: QuestionBundle<'en'> = {
  locale: 'en',
  numberLocale: 'en-US',
  regions,
  currencyUnits,
  magnitudes: { billion: 'bn', million: 'M', thousand: 'k' },
  specialCapitals,
  currencyPrompts: { ZW: 'What is the short name of the domestic currency of Zimbabwe?' },
  provenance: {
    unWpp: 'UN WPP 2024, medium variant',
    worldometer: 'UN WPP 2024, Worldometer table',
    fallback: 'UN WPP 2024',
  },
  prompts: {
    flag: 'Which country does this flag belong to?',
    country: 'Which country is highlighted on the globe?',
    capital: 'What is the capital of this country?',
    currency: 'Which of these names is the currency officially used in this country?',
    language: 'Which of these languages is among the main or official languages of this country?',
    population: 'About how many people does this country have on the {year} projection?',
  },
  explanations: {
    flag: 'This is the flag of {name}.',
    country: 'Highlighted country: {name}. Region: {region}. The marker shows where the country is, not where its capital is.',
    capital: 'Capital: {capital}.',
    capitalSpecial: '{capital}. {note}',
    currency: 'Currency: {units}. The options gave the unit only, without the country and without the code.',
    currencyMultiple: 'Currency (selected valid currencies): {units}. The options gave the unit only, without the country and without the code.',
    language: 'Selected main or official languages: {names}. This is a selection, not a complete list of languages or of their legal standing.',
    population: 'Projection for {year}: {count} people (rounded to {rounded}). {provenance}; not a present-day census. {note}',
  },
  errors: {
    unknownKind: 'Unknown question category.',
    missingCurrencyUnit: 'No unit name for currency {code}',
    invalidPopulation: 'Invalid population figure.',
    notEnoughAnswers: 'Not enough distinct answers: {code}/{type}',
    noCountries: 'This mode has no countries.',
    players: 'The number of players must be 1 or 2.',
    poolTooSmall: 'The chosen mode does not have enough countries.',
    databaseMissing: 'The country database is missing.',
    badCode: 'Invalid or duplicate code: {code}',
    missingField: '{code}: missing {field}',
    languageMismatch: 'The languages and their names do not line up.',
    badPosition: 'Invalid position.',
    badPopulation: 'Invalid population.',
    unknownRegion: 'Unknown region: {code}',
  },
};
