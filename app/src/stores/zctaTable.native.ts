/**
 * Phones: the ZCTA centroid table is bundled with the app, as in the old app
 * (mobile/lib/stores/zctaCentroids.ts). Loaded only when a ZIP outside the built-in table is looked up.
 */
export type ZctaCentroidMap = Record<string, [number, number]>;

let loaded: ZctaCentroidMap | null = null;

export async function loadZctaCentroids(): Promise<ZctaCentroidMap> {
  if (!loaded) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../../public/zcta-centroids.json') as ZctaCentroidMap;
  }
  return loaded;
}
