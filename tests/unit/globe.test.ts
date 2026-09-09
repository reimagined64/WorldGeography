/**
 * U3 — port of the archived `tests/globe.test.js`.
 *
 * Pure timeline checks; canvas rendering is covered by the browser suite (U14).
 * The flight is the game's only 12-second pause, so its shape is asserted for
 * every destination rather than for a sample: the arrival longitude has to
 * agree modulo a full turn for all 195 countries, and a rounding change would
 * show up on a handful of them only.
 */
import { describe, expect, it } from 'vitest';
import { loadCountries, loadGlobe, type Country, type GeoGlobe } from '../helpers/load-baseline.ts';

const Globe = loadGlobe();
const all = loadCountries();

/** The globe only measures and listens; nothing here draws. */
const canvas = (): unknown => ({
  getContext: () => ({}),
  getBoundingClientRect: () => ({ width: 640, height: 480 }),
  addEventListener() {},
});

const globe = (): GeoGlobe => new Globe(canvas(), []);

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
    g.reveal(all[0] as Country);
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
    g.reveal(all[0] as Country, { neutral: true });
    g.update(0);
    for (let t = 100; t <= 12000; t += 100) g.update(t);

    expect(g.target).toBeNull();
    expect(Math.abs(g.lat - (20 * Math.PI) / 180)).toBeLessThan(1e-10);
    expect(g.zoom).toBe(1);
  });

  it('freezes while paused and forgets everything when cancelled', () => {
    const g = globe();
    g.reveal(all[0] as Country);
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
