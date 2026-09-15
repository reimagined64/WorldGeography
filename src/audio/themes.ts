/**
 * The quiz score data, and the composer that unfolds twenty of it.
 *
 * Split out of v7's `audio.js` without a note changing: the original eight-bar
 * loop, the twenty authored theme materials and `composeTheme` are arithmetic
 * over frozen tables, while `audio.ts` keeps everything that touches Web Audio.
 * `audio-golden.json` is a spectral digest of the twenty-one scores this file
 * produces, so a mistyped pitch here is audible and caught.
 *
 * The theme names were Czech string data, exactly as v7 wrote them. Since U11 a
 * score carries the *key* of its name rather than the name: the scores are
 * frozen at module evaluation and a resolved name would be stuck in whichever
 * language happened to be active when the bundle first ran, which is precisely
 * what a language switch has to be able to change.
 */

import type { CatalogKey } from '../i18n/index.ts';

/** A harmonic slot: the bass root, and the four notes the arpeggio walks. */
interface Harmony {
  root: number;
  notes: readonly number[];
}

/** `[catalog key, eight-bar progression, four four-note phrases]`, one per theme. */
export type ThemeMaterial = readonly [CatalogKey, readonly number[], readonly number[]];

/** A score without its name: what the original loop is before it joins the set. */
export interface ScoreBody {
  bpm: number;
  urgentBpm: number;
  key: string;
  stepSeconds: number;
  urgentStepSeconds: number;
  roots: readonly number[];
  chords: readonly (readonly number[])[];
  bassPattern: readonly (number | null)[];
  lead: readonly number[];
}

/** A playable score. `arpOrder` exists on the composed themes only. */
export interface Score extends ScoreBody {
  nameKey: CatalogKey;
  arpOrder?: readonly number[];
}

// Original eight-bar quiz loop: C Dorian, open suspended harmonies and a dry pulse.
// Eighth-note grid at 108 BPM. Short notes leave space for reading and feedback.
export const QUESTION_SCORE: ScoreBody=Object.freeze({bpm:108,urgentBpm:120,key:'C Dorian',
  stepSeconds:60/108/2,urgentStepSeconds:60/120/2,
  roots:[48,48,46,43,48,53,46,43],
  chords:[[60,63,67,74],[60,65,67,69],[58,62,65,72],[55,60,62,65],
          [60,63,67,74],[57,60,65,72],[58,62,65,72],[55,60,62,65]],
  bassPattern:[0,null,0,7,null,0,12,null],
  lead:[0,74,0,72,0,0,67,69, 0,72,0,74,0,0,75,74,
        0,70,0,74,0,0,72,0, 67,0,0,65,0,0,62,0,
        0,74,0,75,0,0,74,72, 0,69,0,72,0,0,74,0,
        70,0,74,0,0,72,0,69, 67,0,0,65,0,62,0,0]});
// Twenty additional authored themes. Their motifs, chord orders, rhythmic
// entrances and bass accents differ; they are not transpositions of one loop.
// A theme unfolds over sixteen bars (35.6 s at 108 BPM), twice the original.
export const THEME_MATERIAL: readonly ThemeMaterial[] = [
  ['theme.01',       [0,3,1,2,0,4,3,2], [74,67,72,69, 75,74,67,72, 70,65,69,74, 67,62,65,72]],
  ['theme.02',  [0,4,2,1,3,0,4,2], [67,74,75,72, 69,65,72,74, 70,74,67,65, 62,67,72,69]],
  ['theme.03',   [2,0,3,4,1,0,3,2], [72,74,67,75, 74,69,65,72, 67,70,74,72, 65,62,67,74]],
  ['theme.04',     [0,1,4,3,2,0,1,2], [75,72,74,67, 65,69,74,72, 70,67,65,74, 72,67,62,65]],
  ['theme.05',   [3,0,2,1,4,3,0,2], [69,72,67,74, 75,67,74,72, 65,70,74,69, 67,72,65,62]],
  ['theme.06',    [4,0,3,2,1,4,0,2], [74,75,72,67, 72,65,69,74, 67,74,70,65, 62,65,72,67]],
  ['theme.07',       [0,2,4,1,3,0,4,2], [67,72,69,75, 74,72,65,69, 70,74,65,67, 72,62,67,74]],
  ['theme.08', [2,4,0,3,1,0,3,2], [72,67,74,69, 75,72,67,74, 65,74,70,69, 67,65,62,72]],
  ['theme.09',    [0,3,4,2,1,3,0,2], [74,72,75,69, 67,74,72,65, 70,67,74,69, 62,72,67,65]],
  ['theme.10',    [3,1,0,4,2,0,3,2], [69,74,72,67, 75,69,74,72, 65,70,67,74, 72,67,65,62]],
  ['theme.11',[0,4,1,3,0,2,4,2], [67,75,74,72, 69,72,65,74, 70,65,74,67, 62,67,65,72]],
  ['theme.12',  [2,3,0,1,4,0,3,2], [72,69,74,75, 67,72,74,65, 70,74,69,67, 65,72,62,67]],
  ['theme.13',     [4,3,0,2,1,0,4,2], [75,74,69,72, 67,65,74,72, 70,69,65,74, 62,72,65,67]],
  ['theme.14',     [0,2,3,4,1,0,4,2], [74,67,69,72, 75,72,74,65, 70,74,67,69, 62,65,67,72]],
  ['theme.15',   [3,4,1,0,2,3,0,2], [69,67,72,74, 75,65,72,74, 70,67,69,65, 72,62,74,67]],
  ['theme.16',  [0,1,3,2,4,0,3,2], [67,74,72,75, 69,74,65,72, 70,65,67,74, 62,72,69,67]],
  ['theme.17',[4,2,0,3,1,0,4,2],[72,75,67,74, 69,65,74,72, 70,69,74,65, 67,62,72,74]],
  ['theme.18', [2,0,4,3,1,4,0,2], [74,69,72,75, 67,72,65,74, 70,74,65,69, 62,67,74,72]],
  ['theme.19',  [0,4,3,1,2,3,0,2], [75,67,72,74, 69,74,72,65, 70,67,74,65, 72,62,69,67]],
  ['theme.20', [3,0,1,4,2,0,4,2], [72,74,69,67, 75,74,65,72, 70,69,67,74, 62,72,67,65]]
];
const HARMONIES: readonly Harmony[]=[
  {root:48,notes:[60,63,67,74]}, {root:46,notes:[58,62,65,72]},
  {root:43,notes:[55,60,62,65]}, {root:53,notes:[57,60,65,72]},
  {root:50,notes:[62,65,69,72]}];
const BASS_PATTERNS: readonly (readonly (number | null)[])[]=[[0,null,0,7,null,0,12,null],[0,null,7,null,0,null,12,7],
  [0,null,null,7,0,null,7,null],[0,null,12,null,0,7,null,0]];
const ENTRANCES: readonly (readonly number[])[]=[[1,3,5,6],[0,3,5,7],[1,2,4,6],[0,2,5,7],[1,3,4,7]];
const DORIAN: readonly number[]=[60,62,63,65,67,69,70,72,74,75,77,79,81,82,84,86];
export function composeTheme(material: ThemeMaterial,theme: number): Score {
  const [nameKey,progression,motif]=material,roots: number[]=[],chords: number[][]=[],lead: number[]=Array<number>(128).fill(0);
  for(let bar=0;bar<16;bar++){
    // Every index below lands inside a table this file owns: the progressions
    // hold 0-4 against five harmonies, `bar` is bounded by the loop, and the
    // motifs are sixteen notes read four at a time.
    const harmonic=HARMONIES[progression[(bar+(bar>=8?theme%3:0))%8]!]!;
    roots.push(harmonic.root);chords.push([...harmonic.notes]);
    const phrase=Math.floor(bar/2)%4,notes=motif.slice(phrase*4,phrase*4+4);
    // Each two-bar call gets a displaced, harmonically resolved answer.
    if(bar%2){notes.reverse();notes[3]=harmonic.notes[(theme+phrase)%4]!+12;}
    const positions=ENTRANCES[(theme+bar)%ENTRANCES.length]!;
    for(let n=0;n<4;n++){
      let pitch=notes[n]!;
      // A contrasting second half develops the motif diatonically, not as a
      // literal repeat. Lower lead density leaves space for reading the quiz.
      if(bar>=8&&n===1)pitch=DORIAN[Math.max(0,Math.min(DORIAN.length-1,DORIAN.indexOf(pitch)+(theme%2?1:-1)))]!;
      if((bar+theme)%3===0&&n===2)continue;
      lead[bar*8+positions[n]!]=Math.min(81,pitch);
    }
  }
  return Object.freeze({nameKey,bpm:108,urgentBpm:120,key:'C Dorian',stepSeconds:60/108/2,urgentStepSeconds:60/120/2,
    roots:Object.freeze(roots),chords:Object.freeze(chords),lead:Object.freeze(lead),
    bassPattern:Object.freeze([...BASS_PATTERNS[theme%4]!]),arpOrder:Object.freeze(theme%2?[0,2,1,3]:[2,0,3,1])});
}
export const QUESTION_SCORES: readonly Score[]=Object.freeze([Object.freeze({...QUESTION_SCORE,nameKey:'theme.original' as CatalogKey}),...THEME_MATERIAL.map(composeTheme)]);
