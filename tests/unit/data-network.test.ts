/**
 * The two pinned downloads, read for real. **Opt-in, and not part of CI.**
 *
 * `npm test` has to be offline, fast and deterministic, and these tests are
 * none of those: they pull 16 MB from population.un.org and 11 MB from
 * GitHub, and they go red when a network is unavailable rather than when the
 * code is wrong. Everything in `data-pipeline.test.ts` therefore runs against
 * payloads synthesized from the committed snapshots; this file exists so a
 * maintainer can prove, on demand, that the synthesized shape is the real one.
 *
 *   WG_NETWORK_TESTS=1 npx vitest run tests/unit/data-network.test.ts
 *
 * Run it before an accepted refresh. It is also the fastest way to find out
 * that a pinned URL has died, which is the failure `sources.lock.json` cannot
 * catch on its own.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POPULATION_BAND } from '../../scripts/data/check.ts';
import { parseGeometry } from '../../scripts/data/fetchers/geometry.ts';
import { fetchPopulation } from '../../scripts/data/fetchers/population.ts';
import { applyTerritory, loadOverrides, UNATTRIBUTED } from '../../scripts/data/merge.ts';
import { DEFAULT_YEAR } from '../../scripts/data/refresh.ts';
import { fetchPinned, loadLock } from '../../scripts/data/sources.ts';
import type { Country } from '../../src/engine/types.ts';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const enabled = process.env['WG_NETWORK_TESTS'] === '1';

const lock = loadLock();
const overrides = loadOverrides(join(REPO, 'data/overrides'));
const baseline = JSON.parse(readFileSync(join(REPO, 'data/build/countries.json'), 'utf8')) as Country[];

/**
 * A fresh cache directory per run, under the system tmpdir.
 *
 * Fresh because the point of this file is to read upstream, and a warm cache
 * would answer with yesterday's bytes; under tmpdir because the repository must
 * stay clean. The four tests share it, so the 16 MB archive is pulled once.
 */
// Created only when the file is enabled, so a skipped `npm test` run leaves
// no directory behind.
const cacheDir = enabled ? mkdtempSync(join(tmpdir(), 'wg-network-')) : '';
const options = { lock, cacheDir, cached: true } as const;

describe.skipIf(!enabled)('the pinned upstream endpoints', () => {
  afterAll(() => rmSync(cacheDir, { recursive: true, force: true }));

  it('serves Natural Earth v5.1.2 at the pinned hash', { timeout: 120_000 }, async () => {
    const result = await fetchPinned('natural-earth', options);
    expect(result.status).toMatch(/pinned|cached/);
    expect(result.pin.sha256).toBe(lock.remote['natural-earth']?.sha256);
  });

  it('codes France, Norway and the three disputed rows as -99, and lands on 288', { timeout: 120_000 }, async () => {
    const result = await fetchPinned('natural-earth', options);
    const raw = parseGeometry(Buffer.from(result.bytes).toString('utf8'));
    expect(raw.filter((polygon) => polygon.iso3 === UNATTRIBUTED)).toHaveLength(10);

    const resolved = applyTerritory(raw, overrides.territory);
    expect(resolved).toHaveLength(288);
    expect(resolved.filter((polygon) => polygon.iso3 === 'FRA')).toHaveLength(3);
    expect(resolved.filter((polygon) => polygon.iso3 === 'NOR')).toHaveLength(4);
    expect(resolved.filter((polygon) => polygon.iso3 === UNATTRIBUTED)).toHaveLength(3);
  });

  it('serves Noto Color Emoji v2.051 at the pinned hash', { timeout: 120_000 }, async () => {
    // `data:flags` is the only command that reads it, and it reads it rarely,
    // so this is the one place a dead font URL surfaces before a maintainer
    // needs the font. The 10 MB lands in the same throwaway cache as the rest:
    // the repository must never contain a font file.
    const result = await fetchPinned('noto-emoji', options);

    expect(result.status).toMatch(/pinned|cached/);
    expect(result.pin.sha256).toBe(lock.remote['noto-emoji']?.sha256);
  });

  it('serves the WPP CSV at the pinned hash and reduces to 195 rows', { timeout: 300_000 }, async () => {
    const result = await fetchPopulation(DEFAULT_YEAR, options);
    expect(result.pin.pin.sha256).toBe(lock.remote['un-wpp']?.sha256);

    const rows = result.rows.filter((row) => baseline.some((country) => country.iso3 === row.iso3));
    expect(rows).toHaveLength(195);
    const total = rows.reduce((sum, row) => sum + row.population, 0);
    expect(total).toBeGreaterThan(POPULATION_BAND.min);
    expect(total).toBeLessThan(POPULATION_BAND.max);
  });
});
