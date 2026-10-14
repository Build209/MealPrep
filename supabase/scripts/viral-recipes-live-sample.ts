/**
 * Live YouTube sample for viral-recipes discovery (optional).
 * Skips when YOUTUBE_API_KEY is unset.
 *
 * Usage: YOUTUBE_API_KEY=... npx tsx scripts/viral-recipes-live-sample.ts
 */

import {
  ALL_VIRAL_RECIPE_CATEGORIES,
  collectCategoryCandidates,
  estimateRefreshQuotaUnits,
  TARGET_PER_CATEGORY,
} from '../supabase/functions/viral-recipes/youtubeDiscovery.ts';

const apiKey = process.env.YOUTUBE_API_KEY?.trim() ?? '';

if (!apiKey) {
  console.log('SKIP: viral-recipes-live-sample (set YOUTUBE_API_KEY to run live YouTube checks)');
  process.exit(0);
}

async function printMode(label: string, useVideoCategoryId: boolean): Promise<void> {
  console.log(`\n=== ${label} (videoCategoryId ${useVideoCategoryId ? '26' : 'off'}) ===`);
  for (const category of ALL_VIRAL_RECIPE_CATEGORIES) {
    const rows = await collectCategoryCandidates(apiKey, category, { useVideoCategoryId });
    const top = rows.slice(0, Math.min(8, TARGET_PER_CATEGORY));
    console.log(`\n[${category}] ${top.length} shown (${rows.length} after filter)`);
    for (const row of top) {
      console.log(`  - ${row.title} (${row.viewCount.toLocaleString()} views)`);
    }
  }
}

async function main(): Promise<void> {
  console.log(`Estimated quota per full refresh: ~${estimateRefreshQuotaUnits()} units`);
  await printMode('With Howto & Style category', true);
  await printMode('Without videoCategoryId', false);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
