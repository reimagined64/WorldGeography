/**
 * The basemap, from Natural Earth 1:110m Admin 0.
 *
 * The reduction is the same one `prepare_data.py` performed: explode every
 * MultiPolygon into its member polygons, keep the exterior ring of each and
 * throw the holes away, drop rings of three points or fewer, and round every
 * coordinate to three decimals — about a metre at the equator, which is far
 * finer than a 1:110m generalization can justify and small enough to keep the
 * whole basemap inside 177 KB of the single-file build.
 *
 * The country code is read from **`ISO_A3`**, not from `ISO_A3_EH`. That is a
 * deliberate deviation from KTD9. `ISO_A3_EH` pre-resolves France and Norway,
 * which sounds helpful and is not: `data/overrides/territory.json` already
 * carries seven hand-written rules for exactly those two rows, and rules that
 * match nothing fail the build by design. More importantly, `ISO_A3_EH` would
 * split the disputed-territory decisions between a magic upstream column and
 * the override file, when the whole point of the layer is that every one of
 * them is visible in one reviewable place.
 */
import { applyTerritory, type MapPolygon, type TerritoryOverrides } from '../merge.ts';
import { fetchPinned, type FetchOptions } from '../sources.ts';

/** Only the two properties that matter; the file carries ninety-odd more. */
interface Feature {
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
}

/** Three decimals, via the integer scale so `Math.round` sees a whole number. */
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Turns the GeoJSON into the flat ring list `map.json` stores.
 *
 * Feature order and ring order are preserved, because `territory.json` narrows
 * a rule with a `near` point rather than an index but the committed baseline
 * still records one particular order, and a reordering would show up as a
 * whole-file diff that hides the real change.
 */
export function parseGeometry(geojson: string): MapPolygon[] {
  const parsed = JSON.parse(geojson) as { features?: readonly Feature[] };
  const features = parsed.features;
  if (!Array.isArray(features)) throw new Error('the Natural Earth file has no `features` array');

  const polygons: MapPolygon[] = [];
  for (const feature of features) {
    const iso3 = feature.properties?.['ISO_A3'];
    if (typeof iso3 !== 'string') {
      throw new Error('a Natural Earth feature has no `ISO_A3` property — upstream changed shape');
    }
    const geometry = feature.geometry;
    if (geometry === undefined) continue;
    const rings =
      geometry.type === 'Polygon'
        ? [geometry.coordinates as number[][][]]
        : geometry.type === 'MultiPolygon'
          ? (geometry.coordinates as number[][][][])
          : [];

    for (const polygon of rings) {
      // Ring 0 is the exterior; the rest are holes, and a hole drawn as land
      // would fill in the Caspian.
      const ring = polygon[0];
      if (ring === undefined || ring.length <= 3) continue;
      polygons.push({
        iso3,
        points: ring.map((point) => [round3(point[0] ?? 0), round3(point[1] ?? 0)] as const),
      });
    }
  }
  return polygons;
}

export interface GeometryFetch {
  /** As upstream codes them — France, Norway and the three disputed rows are `-99`. */
  raw: MapPolygon[];
  /** After `territory.json`. This is what `data/build/map.json` holds. */
  polygons: MapPolygon[];
  pin: Awaited<ReturnType<typeof fetchPinned>>;
}

export async function fetchGeometry(
  territory: TerritoryOverrides,
  options: FetchOptions,
): Promise<GeometryFetch> {
  const pin = await fetchPinned('natural-earth', options);
  const raw = parseGeometry(Buffer.from(pin.bytes).toString('utf8'));
  return { raw, polygons: applyTerritory(raw, territory), pin };
}
