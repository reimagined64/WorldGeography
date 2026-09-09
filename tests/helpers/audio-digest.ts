/**
 * Shape and tolerance of `audio-golden.json`.
 *
 * The fixture is a spectral digest of Chromium's render of each of the 21
 * question themes: 32 equal-length frames per theme, 24 log-spaced bands per
 * frame, each band a dBFS level. It is deliberately not a hash of the PCM —
 * Chromium's `OfflineAudioContext` is not bit-reproducible even between two
 * runs of the same build. Measured across two captures of Chromium 153: 3 of
 * 16,128 band cells moved, each by one stored digit (0.01 dB), and the loudest
 * sample of a theme moved by at most 9.1e-8 relative. The tolerances below sit
 * an order of magnitude above that and still an order of magnitude below any
 * audible or structural change to the synthesis — a dropped voice, a changed
 * envelope or a retuned filter moves whole bands by decibels.
 *
 * Note counts, theme names and lead lengths are exact: nothing about them is
 * floating point.
 */

export const SAMPLE_RATE = 44_100;
export const FRAMES = 32;
export const FFT_SIZE = 2048;
export const WINDOWS_PER_FRAME = 4;
export const BANDS = 24;
export const BAND_LOW_HZ = 40;
export const BAND_HIGH_HZ = 16_000;

/** Log-spaced band edges; `BANDS + 1` of them. */
export const BAND_EDGES: number[] = Array.from({ length: BANDS + 1 }, (_, i) =>
  BAND_LOW_HZ * Math.pow(BAND_HIGH_HZ / BAND_LOW_HZ, i / BANDS),
);

/** Silence floor, so an empty band is a stable constant rather than -Infinity. */
export const FLOOR_DB = -240;

export const AUDIO_TOLERANCE = {
  bandDb: 0.25,
  amplitudeRelative: 1e-5,
} as const;

export interface ThemeDigest {
  index: number;
  name: string;
  leadLength: number;
  stepSeconds: number;
  durationSeconds: number;
  notes: number;
  rms: number;
  peak: number;
  spectrum: number[][];
}

export interface AudioGolden {
  version: number;
  browser: string;
  sampleRate: number;
  frames: number;
  fftSize: number;
  windowsPerFrame: number;
  bandEdgesHz: number[];
  floorDb: number;
  tolerance: { bandDb: number; amplitudeRelative: number };
  units: string;
  themes: ThemeDigest[];
}

const relative = (expected: number, actual: number): number =>
  Math.abs(expected - actual) / Math.max(Math.abs(expected), 1e-12);

/**
 * Every way `actual` fails to reproduce `expected`, as human-readable lines.
 * An empty array is a pass; U5 measures its ported synthesizer with this.
 */
export function compareAudioGolden(expected: AudioGolden, actual: AudioGolden): string[] {
  const problems: string[] = [];
  if (actual.themes.length !== expected.themes.length) {
    problems.push(`theme count ${actual.themes.length}, expected ${expected.themes.length}`);
    return problems;
  }
  for (const [index, want] of expected.themes.entries()) {
    const got = actual.themes[index];
    if (got === undefined) {
      problems.push(`theme ${index} missing`);
      continue;
    }
    for (const key of ['name', 'leadLength', 'notes'] as const) {
      if (got[key] !== want[key]) {
        problems.push(`theme ${index} ${key}: ${String(got[key])}, expected ${String(want[key])}`);
      }
    }
    for (const key of ['rms', 'peak', 'stepSeconds', 'durationSeconds'] as const) {
      const drift = relative(want[key], got[key]);
      if (drift > AUDIO_TOLERANCE.amplitudeRelative) {
        problems.push(`theme ${index} ${key}: ${got[key]} vs ${want[key]} (${drift.toExponential(2)} relative)`);
      }
    }
    for (const [frame, wantRow] of want.spectrum.entries()) {
      const gotRow = got.spectrum[frame];
      if (gotRow === undefined || gotRow.length !== wantRow.length) {
        problems.push(`theme ${index} frame ${frame}: ${gotRow?.length ?? 'missing'} bands`);
        continue;
      }
      for (const [band, wantDb] of wantRow.entries()) {
        const gotDb = gotRow[band] as number;
        if (Math.abs(gotDb - wantDb) > AUDIO_TOLERANCE.bandDb) {
          problems.push(
            `theme ${index} frame ${frame} band ${band}: ${gotDb} dB, expected ${wantDb} dB`,
          );
        }
      }
    }
  }
  return problems;
}
