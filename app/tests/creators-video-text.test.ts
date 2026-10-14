/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeVideos, interleaveByChannel, pickRecentVideos } from '../src/creators/feed';
import { cleanVideoText, cleanVideoTitle, imageAddress, stripInvalidUnicode, truncateByCodePoints, watchLink } from '../src/creators/videoText';
import { creatorSearchText, creatorVideoFromRow, creatorVideosFromRows, type CreatorVideoRow } from '../src/data/creatorRows';

test('sanitizer (old creator-video-sanitizer-check): code point cut, no NUL, no lone surrogates', () => {
  const emoji = '🍳🔥';
  const long = 'a'.repeat(498) + emoji + 'bc';
  const truncated = truncateByCodePoints(long, 500);
  assert.equal([...truncated].length, 500);
  assert.ok(!truncated.includes('\u0000'));
  assert.equal(stripInvalidUnicode('hi\u0000there'), 'hithere');
  assert.equal(stripInvalidUnicode('a\ud800b'), 'ab');
  assert.equal(stripInvalidUnicode('a\udc00b'), 'ab');
  assert.equal(stripInvalidUnicode('ok 🍳'), 'ok 🍳');
  assert.equal(truncateByCodePoints('abc', 0), '');
});

test('cleanVideoText: control characters out, spaces collapsed, cut by code point', () => {
  assert.equal(cleanVideoText('  Easy\u0007  pasta \n\n night ', 100), 'Easy pasta night');
  assert.equal(cleanVideoText(null, 10), '');
  assert.equal(cleanVideoText('🍳🍳🍳', 2), '🍳🍳');
  assert.equal(cleanVideoTitle('\u0000  '), 'Untitled');
  assert.equal(cleanVideoTitle('Tacos\ud800'), 'Tacos');
});

test('watchLink: https only, labelled for the video site in plain words', () => {
  assert.deepEqual(watchLink('https://www.youtube.com/watch?v=abc'), { url: 'https://www.youtube.com/watch?v=abc', label: 'Watch on YouTube' });
  assert.equal(watchLink('https://youtu.be/abc')?.label, 'Watch on YouTube');
  assert.equal(watchLink('https://m.youtube.com/watch?v=abc')?.label, 'Watch on YouTube');
  assert.equal(watchLink('https://example.com/v/1')?.label, 'Watch the video');
  assert.equal(watchLink('https://notyoutube.com/v')?.label, 'Watch the video');
  assert.equal(watchLink('http://www.youtube.com/watch?v=abc'), null);
  assert.equal(watchLink('javascript:alert(1)'), null);
  assert.equal(watchLink('vnd.youtube://abc'), null);
  assert.equal(watchLink('https://user:pw@youtube.com/'), null);
  assert.equal(watchLink('not a url'), null);
  assert.equal(watchLink(''), null);
  assert.equal(watchLink(null), null);
});

test('imageAddress: https, or http on this machine only', () => {
  assert.equal(imageAddress('https://i.example.com/t.jpg'), 'https://i.example.com/t.jpg');
  assert.equal(imageAddress('http://127.0.0.1:4173/t.png'), 'http://127.0.0.1:4173/t.png');
  assert.equal(imageAddress('http://example.com/t.jpg'), null);
  assert.equal(imageAddress('data:image/png;base64,AAAA'), null);
  assert.equal(imageAddress(undefined), null);
});

const row = (over: Partial<CreatorVideoRow>): CreatorVideoRow => ({
  video_id: 'v1',
  channel_id: 'ch1',
  title: 'Weeknight Chicken Bolognese',
  description_snippet: null,
  thumbnail_url: 'https://i.example.com/v1.jpg',
  published_at: '2026-10-01T00:00:00Z',
  view_count: '1200',
  duration_seconds: 600,
  is_short: false,
  url: 'https://www.youtube.com/watch?v=v1',
  ...over,
});

test('creatorVideoFromRow: cleans text, joins the creator, drops rows with no safe link', () => {
  const creators = new Map([['ch1', { channelId: 'ch1', name: 'Test Chef', handle: null, avatarUrl: null }]]);
  const video = creatorVideoFromRow(row({ title: ' Tacos\u0000 night ' }), creators);
  assert.ok(video);
  assert.equal(video.title, 'Tacos night');
  assert.equal(video.creatorName, 'Test Chef');
  assert.equal(video.viewCount, 1200);
  assert.equal(video.watch.label, 'Watch on YouTube');
  assert.equal(creatorVideoFromRow(row({ url: 'javascript:alert(1)' }), creators), null);
  assert.equal(creatorVideoFromRow(row({ video_id: '  ' }), creators), null);
  assert.equal(creatorVideoFromRow(row({ channel_id: 'other' }), creators)?.creatorName, 'Creator');
  assert.equal(creatorVideoFromRow(row({ thumbnail_url: 'http://x.com/a.jpg' }), creators)?.thumbnailUrl, null);
  assert.equal(creatorVideosFromRows([row({}), row({ video_id: 'v2', url: 'ftp://x' })], []).length, 1);
});

test('creatorSearchText: trimmed, cut to 80, at least 2 characters', () => {
  assert.equal(creatorSearchText(' a '), null);
  assert.equal(creatorSearchText(' ab '), 'ab');
  assert.equal(creatorSearchText('x'.repeat(100))?.length, 80);
});

type V = { videoId: string; channelId: string; title: string; description: string; isShort: boolean };
const v = (videoId: string, channelId: string, title = 'Easy chicken dinner'): V => ({ videoId, channelId, title, description: '', isShort: false });

test('interleaveByChannel: channels take turns in first-seen order, each keeps its order, stops at the limit', () => {
  const list = [v('a1', 'A'), v('a2', 'A'), v('a3', 'A'), v('b1', 'B'), v('c1', 'C'), v('b2', 'B')];
  assert.deepEqual(interleaveByChannel(list, 10).map((x) => x.videoId), ['a1', 'b1', 'c1', 'a2', 'b2', 'a3']);
  assert.deepEqual(interleaveByChannel(list, 4).map((x) => x.videoId), ['a1', 'b1', 'c1', 'a2']);
  assert.deepEqual(interleaveByChannel([], 4), []);
  assert.deepEqual(interleaveByChannel(list, 0), []);
});

test('pickRecentVideos: drops non-recipe videos and repeats, then interleaves', () => {
  const list = [v('a1', 'A'), v('a1', 'A'), v('x', 'B', '14 Air Fryer Hacks You Need to Know'), v('b1', 'B'), v('a2', 'A')];
  assert.deepEqual(pickRecentVideos(list, 10).map((x) => x.videoId), ['a1', 'b1', 'a2']);
  assert.deepEqual(dedupeVideos([v('', 'A'), v('q', 'A'), v('q', 'B')]).map((x) => x.channelId), ['A']);
});
