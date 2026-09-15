/**
 * U5 — the ported globe, measured where a browser is not needed.
 *
 * Pure timeline and projection checks; painting is covered by the browser suite
 * (U14). The flight is the game's only 12-second pause, so its shape is
 * asserted for every destination rather than for a sample: the arrival
 * longitude has to agree modulo a full turn for all 195 countries, and a
 * rounding change would show up on a handful of them only.
 *
 * The projection is asserted against the textbook orthographic formulas rather
 * than against the port's own arithmetic. A painted-pixel check in the browser
 * cannot tell a mirrored globe from a correct one — every stroke still lands on
 * the disc — so the sign of each axis, and the far hemisphere being dropped,
 * are pinned here with numbers derived by hand.
 *
 * Countries come from the frozen fixture rather than `data/build/`: the
 * assertions below are about geometry over a fixed set of 195 destinations, and
 * a future data refresh should not silently change which ones they are.
 */
import { describe, expect, it } from 'vitest';
import { Globe, type Vector } from '../../src/globe/globe.ts';
import { loadCountries } from '../helpers/load-baseline.ts';
import type { GlobeCountry } from '../../src/globe/globe.ts';

/**
 * The globals the constructor reaches for before it can measure itself. Node
 * has none of them and a bare reference throws, so they are installed here
 * rather than guarded for inside the port. `document` and `cancelAnimationFrame`
 * are absent because the stubbed `requestAnimationFrame` never runs a frame.
 */
const browser = globalThis as unknown as Record<string, unknown>;
browser['matchMedia'] = () => ({ matches: false });
browser['devicePixelRatio'] = 1;
browser['ResizeObserver'] = class {
  observe(): void {}
  disconnect(): void {}
};
browser['requestAnimationFrame'] = () => 1;

const all = loadCountries();

/** The globe only measures and listens; nothing in this file draws. */
const canvas = (): HTMLCanvasElement =>
  ({
    getContext: () => ({}),
    getBoundingClientRect: () => ({ width: 640, height: 480 }),
    addEventListener() {},
  }) as unknown as HTMLCanvasElement;

const globe = (): Globe => new Globe(canvas(), []);

describe('the twelve-second flight', () => {
  it('spins at least three full uniform turns, then settles and zooms, for all 195 destinations', () => {
    let scenarios = 0;

    for (const country of all) {
      const g = globe();
      let done = 0;
      const stages: string[] = [];
      g.reveal(country, { onComplete: () => (done += 1), onStage: (x) => stages.push(x) });
      const from = g.lon;

      g.update(0);
      for (let t = 100; t <= 9000; t += 100) g.update(t);
      expect(g.lon - from).toBeGreaterThanOrEqual(6 * Math.PI - 1e-8);
      expect(g.zoom).toBe(0.85);
      expect(g.target).toBeNull();

      // The settle stage must decelerate, never jump or reverse.
      const rate = (g.flight?.spinAngle as number) / 8400;
      expect(rate).toBeGreaterThan(0);
      const startSettle = g.lon;
      g.update(9100);
      expect(g.lon).toBeGreaterThan(startSettle);
      expect(g.lon - startSettle).toBeLessThan(rate * 100);

      for (let t = 9200; t < 12000; t += 100) {
        g.update(t);
        expect(done).toBe(0);
      }
      g.update(12000);
      expect(g.flight).toBeNull();
      // The callback waits for the frame after the last paint.
      expect(done).toBe(0);

      g.pendingComplete?.();
      expect(done).toBe(1);
      expect(g.target).toBe(country);
      expect(Math.abs(g.lat - (country.lat * Math.PI) / 180)).toBeLessThan(1e-10);
      expect(Math.abs(Math.sin((g.lon - (country.lon * Math.PI) / 180) / 2))).toBeLessThan(1e-8);
      expect(stages).toEqual(['depart', 'spin', 'settle', 'zoom']);
      scenarios += 1;
    }

    expect(scenarios).toBe(195);
  });

  it('keeps its full duration with reduced motion, moving nothing', () => {
    const g = globe();
    g.setMotion(false);
    g.reveal(all[0] as GlobeCountry);
    const initial = [g.lat, g.lon, g.zoom];

    g.update(0);
    for (let t = 100; t <= 11900; t += 100) g.update(t);
    expect(g.flight).not.toBeNull();
    expect([g.lat, g.lon, g.zoom]).toEqual(initial);

    g.update(12000);
    expect(g.flight).toBeNull();
  });

  it('lands on a neutral globe for a flag bonus, hiding the country', () => {
    const g = globe();
    g.reveal(all[0] as GlobeCountry, { neutral: true });
    g.update(0);
    for (let t = 100; t <= 12000; t += 100) g.update(t);

    expect(g.target).toBeNull();
    expect(Math.abs(g.lat - (20 * Math.PI) / 180)).toBeLessThan(1e-10);
    expect(g.zoom).toBe(1);
  });

  it('freezes while paused and forgets everything when cancelled', () => {
    const g = globe();
    g.reveal(all[0] as GlobeCountry);
    g.update(0);
    g.update(100);

    g.pauseFlight(true);
    g.update(10000);
    g.update(10100);
    expect(g.flight?.elapsed).toBe(100);

    g.pauseFlight(false);
    g.update(20000);
    g.update(20100);
    expect(g.flight?.elapsed).toBe(200);

    g.cancelFlight();
    g.update(20200);
    expect(g.flight).toBeNull();
    expect(g.pendingComplete).toBeNull();
    expect(g.locked).toBe(false);
  });
});

describe('the flight timeline constants', () => {
  it('is four stages, three turns and exactly 12,000 ms', () => {
    expect(Globe.FLIGHT.total).toBe(12000);
    expect(Globe.FLIGHT.depart + Globe.FLIGHT.spin + Globe.FLIGHT.settle + Globe.FLIGHT.zoom).toBe(
      12000,
    );
    expect(Globe.FLIGHT.turns).toBeGreaterThanOrEqual(3);
  });
});

describe('the orthographic projection', () => {
  const SIN20 = 0.342_020_143_325_668_7;
  const COS20 = 0.939_692_620_785_908_4;

  /**
   * A globe left at its home rotation — 20° N, 12° E — with one zero-length
   * frame run so `update` has built the rotation for exactly that viewpoint.
   */
  const home = (): Globe => {
    const g = globe();
    g.update(0);
    return g;
  };

  /**
   * `[lon, lat]` to `[x, y, z]` on the unit sphere, hand-derived from
   * `x = cos φ · sin Δ`, `y = sin φ0 · cos φ · cos Δ − cos φ0 · sin φ` and
   * `z = sin φ0 · sin φ + cos φ0 · cos φ · cos Δ`, with `Δ = λ − 12°` and
   * `φ0 = 20°`. `y` is the standard north-up value negated, because canvas `y`
   * grows downward — which is the sign a pixel check cannot see.
   */
  const CASES: readonly (readonly [string, number, number, Vector])[] = [
    ['the point under the viewer', 12, 20, [0, 0, 1]],
    ['the north pole, above the centre', 0, 90, [0, -COS20, SIN20]],
    ['a quarter turn east, on the horizon', 102, 20, [COS20, -COS20 * SIN20, SIN20 * SIN20]],
    ['a quarter turn west, on the horizon', -78, 20, [-COS20, -COS20 * SIN20, SIN20 * SIN20]],
    ['the south pole, below the centre and behind it', 0, -90, [0, COS20, -SIN20]],
  ];

  for (const [name, lon, lat, expected] of CASES) {
    it(`projects ${name}`, () => {
      const p = home().point(lon, lat);
      expect(p[0]).toBeCloseTo(expected[0], 12);
      expect(p[1]).toBeCloseTo(expected[1], 12);
      expect(p[2]).toBeCloseTo(expected[2], 12);
    });
  }

  it('drops the far hemisphere, edge included', () => {
    const g = home();
    // 120° of longitude away at the viewer's own latitude is past the horizon.
    expect(g.point(132, 20)[2]).toBeLessThan(0);
    // The antipode of the viewpoint is as far behind the globe as a point gets.
    expect(g.point(-168, -20)[2]).toBeCloseTo(-1, 12);
    // The terminator itself is kept: `landPath` and `line` both admit z >= 0.
    expect(g.point(102, 20)[2]).toBeGreaterThan(0);
  });

  it('turns with the globe rather than with the country', () => {
    const g = home();
    const before = g.point(60, 0);
    g.lon += Math.PI / 2;
    g.targetLon = g.lon;
    g.update(0);
    const after = g.point(60, 0);

    // A point east of the centre swings west as the viewpoint moves east.
    expect(before[0]).toBeGreaterThan(0);
    expect(after[0]).toBeLessThan(0);
  });

  it('culls a polygon that is wholly on the far side', () => {
    // Through the constructor, so the ring is converted exactly as a map
    // polygon is; no context is touched on the culled path, which is what
    // makes it assertable outside a browser.
    const g = new Globe(canvas(), [
      { iso3: 'FAR', points: [[-168, -20], [-160, -25], [-175, -15]] },
    ]);
    g.update(0);

    expect(g.landPath(g.polys[0]!.vec, 100)).toBe(false);
  });
});
