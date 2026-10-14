import assert from 'node:assert/strict';
import {
  dedupeVideoUpsertRows,
  stripInvalidUnicode,
  truncateByCodePoints,
} from '../supabase/functions/creator-videos/videoSanitizer.ts';

const emoji = '🍳🔥';
const long = 'a'.repeat(498) + emoji + 'bc';
const truncated = truncateByCodePoints(long, 500);
assert.equal([...truncated].length, 500);
assert.ok(!truncated.includes('\u0000'));
assert.equal(stripInvalidUnicode('hi\u0000there'), 'hithere');
assert.equal(stripInvalidUnicode('a\ud800b'), 'ab');

const rows = dedupeVideoUpsertRows([
  {
    video_id: 'abc',
    channel_id: 'ch',
    title: 'One',
    description_snippet: null,
    thumbnail_url: 'https://example.com/t.jpg',
    published_at: null,
    view_count: 1,
    like_count: 0,
    duration_seconds: 60,
    is_short: false,
    url: 'https://youtube.com/watch?v=abc',
    fetched_at: new Date().toISOString(),
  },
  {
    video_id: 'abc',
    channel_id: 'ch',
    title: 'Two',
    description_snippet: null,
    thumbnail_url: 'https://example.com/t.jpg',
    published_at: null,
    view_count: 2,
    like_count: 0,
    duration_seconds: 60,
    is_short: false,
    url: 'https://youtube.com/watch?v=abc',
    fetched_at: new Date().toISOString(),
  },
]);
assert.equal(rows.length, 1);
assert.equal(rows[0]!.title, 'Two');

console.log('creator-video-sanitizer-check: ok');
