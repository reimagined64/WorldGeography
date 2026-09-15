/**
 * The end-of-run screen, and the training game it can spawn.
 *
 * It is the only screen that writes the high score, and it writes it before it
 * prints anything: the record has to reflect the run being shown, and a player
 * who closes the tab on this screen must still keep the number.
 *
 * The training run it builds is deliberately not a whole `GameState` — v7 built
 * it without the deck, the seed or the attempt ledger, and every `review` branch
 * in the engine and in the views stops before reading one. It is also never
 * saved as a resumable run for the same reason.
 */
import * as Core from '../../engine/core.ts';
import type { AnswerResult, GameState, Question } from '../../engine/types.ts';
import { store } from '../state.ts';
import { STORE } from '../storage.ts';
import { byCode, countries } from '../database.ts';
import { $, ALL_TYPES, attempts, esc, flagImage, optional, persist, pointText, seconds } from '../dom.ts';
import { kindName, locale, t } from '../../i18n/index.ts';
import { renderView, setView } from '../main.ts';
import { renderGame, saveGame, scrollQuestion, stopClock } from './game.ts';

export function renderResults(): void {
  const game=store.game;
  if(!game)return;setView('results');
  const timed=game.answers.filter(a=>Number.isFinite(a?.elapsedMs)&&!a.timedOut),average=timed.length?timed.reduce((sum,a)=>sum+a.elapsedMs,0)/timed.length:null,bonus=game.answers.reduce((sum,a)=>sum+(a?.bonusPoints||0),0),timeouts=game.answers.filter(a=>a?.timedOut).length;
  const correct=game.answers.filter(a=>a?.correct).length,total=game.answers.length,accuracy=total?Math.round(correct/total*100):0,points=game.scores.reduce((a,b)=>a+b,0),wrong=game.questions.map((q,i)=>({q,a:game.answers[i],i})).filter((x): x is {q:Question;a:AnswerResult;i:number}=>Boolean(x.a&&!x.a.correct)),bestScore=Math.max(...game.scores);
  if(!game.review&&(!store.record||bestScore>(store.record.points||0))){store.record={points:bestScore,total,date:new Date().toISOString()};persist(STORE.record,store.record);}
  let title=game.review?t('results.titleReview'):t('results.titleOver');
  let sub=`${t('results.correctOf',{count:correct,total})} ${game.review?t('results.subReview'):t('results.subPlay')}`;
  if(game.options.players===2){title=game.scores[0]===game.scores[1]?t('results.tie'):t('results.winner',{name:game.options.names[game.scores[0]!>game.scores[1]!?0:1]});sub=t('results.duelSub');}
  $('results-view').innerHTML=`<div class="result-wrap"><div class="result-top"><div class="stamp" aria-hidden="true">◎</div><div class="eyebrow accent">${game.review?t('results.eyebrowReview'):t('results.eyebrowOver')}</div><h1>${esc(title)}</h1><p>${esc(sub)}</p>${game.options.players===2?`<div class="duel-result">${game.scores.map((s,i)=>`<span>${t('results.duelPoints',{name:esc(game.options.names[i]),points:pointText(s),unit:t('results.pointsWord',{count:s})})}<br>${t('results.duelLives',{answers:t('results.answersCount',{count:game.answers.filter(a=>a.player===i).length}),attempts:attempts(game.earnedLives[i]!)})}</span>`).join('')}</div>`:''}</div>
  <div class="result-stats"><div class="result-stat"><strong>${pointText(points)}</strong><span>${t('results.statPoints')}</span></div><div class="result-stat"><strong>${accuracy} %</strong><span>${t('results.statAccuracy')}</span></div><div class="result-stat"><strong>${game.review?(average===null?'—':seconds(average)+' s'):'+'+game.earnedLives.reduce((a,b)=>a+b,0)}</strong><span>${game.review?t('results.statAverage'):t('results.statEarned')}</span></div></div>
  <div class="result-timing-summary">${t('results.timingSummary',{visited:t('results.visited',{count:new Set(game.questions.filter(q=>q.type!=='flag').map(q=>q.country)).size}),points:`${pointText(bonus)} ${t('results.pointsWord',{count:bonus})}`,timeouts,average:average===null?'—':seconds(average)+' s'})}</div>
  <div class="result-columns"><div><h2>${t('results.howYouDid')}</h2>${ALL_TYPES.map(type=>{const qs=game.questions.map((q,i)=>({q,i})).filter(x=>x.q.type===type&&game.answers[x.i]),num=qs.filter(x=>game.answers[x.i]!.correct).length;return `<div class="category-result"><div class="bar-label"><span>${esc(kindName(type))}</span><span>${num} / ${qs.length}</span></div><div class="bar"><span style="width:${qs.length?num/qs.length*100:0}%"></span></div></div>`;}).join('')}</div><div><h2>${wrong.length?t('results.worthRepeating'):t('results.flawless')}</h2><div class="mistake-list">${wrong.map(({q,a})=>`<div class="mistake"><div class="mistake-country">${flagImage(q.country)}<strong>${esc(byCode[q.country]!.name)} · ${esc(kindName(q.type))}</strong></div><small>${esc(q.prompt)}</small><span class="mistake-answer">✓ ${esc(q.options[q.correct])}</span><small>${t('results.yourAnswer',{answer:a.timedOut?t('results.timedOut'):esc(q.options[a.selected??-1]??'—')})}</small></div>`).join('')}</div></div></div>
  <div class="result-actions"><button id="again" class="primary"><span>${t('results.again')}</span><span class="arrow">→</span></button>${wrong.length?`<button id="review" class="secondary">${t('results.review')}</button>`:''}<button id="results-atlas" class="secondary">${t('results.atlas')}</button></div></div>`;
  $('again').onclick=()=>{renderView('home');window.scrollTo({top:0,behavior:'auto'});};$('results-atlas').onclick=()=>{renderView('atlas');window.scrollTo({top:0,behavior:'auto'});};
  if(optional('review'))$('review').onclick=()=>{
    const questions=wrong.map(({q},i)=>({...Core.makeQuestion(byCode[q.country]!,q.type,countries,game.options.difficulty),visit:i,player:0}));
    stopClock();store.clock=null;store.clockIndex=-1;store.phase='idle';
    // Asserted rather than built whole: a training run carries no deck, no seed
    // and no ledger, exactly as v7 wrote it, and nothing that reads a `review`
    // game reaches any of them.
    store.game={version:7,revealedIndex:null,clock:null,review:true,lang:locale(),options:{...game.options,players:1,names:[t('home.trainingName')]},questions,index:0,answers:[],scores:[0],created:new Date().toISOString(),completed:false} as unknown as GameState;
    store.lastGlobeCode=null;store.selected=0;saveGame();renderGame();scrollQuestion(true);
  };
}
