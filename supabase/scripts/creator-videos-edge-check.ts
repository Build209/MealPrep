import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCreatorListVideoRows } from '../supabase/functions/creator-videos/creatorListVisibility.ts';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexSource = fs.readFileSync(
  path.join(mobileRoot, 'supabase/functions/creator-videos/index.ts'),
  'utf8',
);

assert.match(indexSource, /'Access-Control-Max-Age': '86400'/);
assert.match(indexSource, /Promise\.all\(\[[\s\S]*creatorsMapPromise/);
assert.match(indexSource, /queryFeedVideoRows/);

// Rate limiting must not trust the unverified Authorization header (JWT verification is off).
const rateLimitKeySource = indexSource.slice(
  indexSource.indexOf('function rateLimitKey('),
  indexSource.indexOf('const clientHits'),
);
assert.ok(rateLimitKeySource.length > 0, 'rateLimitKey should exist');
assert.doesNotMatch(
  rateLimitKeySource,
  /Authorization|payload\.sub|atob\(/,
  'rate limit key must come from the network address, not a caller-supplied token',
);
assert.match(indexSource, /SEARCH_QUERY_MAX_LENGTH = 80/);
assert.match(indexSource, /\.slice\(0, SEARCH_QUERY_MAX_LENGTH\)/, 'search text should be length-capped');
assert.doesNotMatch(
  indexSource,
  /while\s*\(true\)\s*\{[\s\S]*creator_videos/,
  'creators action should not serially page creator_videos in index.ts',
);

type PageRequest = { from: number; to: number };

function makePagedAdmin(totalRows: number, pageSize = 1000) {
  const pageRequests: PageRequest[] = [];
  const rows = Array.from({ length: totalRows }, (_, index) => ({
    video_id: `vid_${index}`,
    channel_id: `UC_${index % 3}`,
    title: 'Easy Chicken Dinner Recipe',
    description_snippet: '',
    is_short: false,
  }));

  const admin = {
    from(table: string) {
      assert.equal(table, 'creator_videos');
      return {
        select(
          _columns: string,
          options?: { count?: 'exact'; head?: boolean },
        ) {
          if (options?.head) {
            return Promise.resolve({ count: totalRows, error: null });
          }
          return {
            order() {
              return {
                range(from: number, to: number) {
                  pageRequests.push({ from, to });
                  const slice = rows.slice(from, Math.min(to + 1, rows.length));
                  return Promise.resolve({ data: slice, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  return { admin, pageRequests };
}

async function testParallelCreatorListPaging() {
  const { admin, pageRequests } = makePagedAdmin(2500);
  const startedAt = Date.now();
  const loaded = await loadCreatorListVideoRows(admin as never);
  const elapsedMs = Date.now() - startedAt;

  assert.equal(loaded.length, 2500);
  assert.equal(pageRequests.length, 3);
  assert.ok(
    pageRequests.some((req) => req.from === 1000),
    'should fetch trailing pages, not only the first 1000 rows',
  );
  assert.ok(elapsedMs < 80, `expected parallel page fetches (took ${elapsedMs}ms)`);
}

(async () => {
  await testParallelCreatorListPaging();
  console.log('creator-videos-edge-check: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
