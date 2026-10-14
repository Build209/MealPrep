/**
 * Web: the ZCTA centroid table is a static file (public/zcta-centroids.json, about 0.9 MB) fetched
 * the first time a ZIP outside the built-in table is looked up, as in the old web app
 * (mobile/lib/stores/zctaCentroids.web.ts). The app is served from the site root.
 */
export type ZctaCentroidMap = Record<string, [number, number]>;

let loadPromise: Promise<ZctaCentroidMap> | null = null;

export function loadZctaCentroids(): Promise<ZctaCentroidMap> {
  if (!loadPromise) {
    loadPromise = fetch('/zcta-centroids.json')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load ZCTA table (${res.status})`);
        return (await res.json()) as ZctaCentroidMap;
      })
      .catch((error: unknown) => {
        loadPromise = null;
        throw error;
      });
  }
  return loadPromise;
}
