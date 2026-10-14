import assert from 'node:assert/strict';
import {
  channelIdsWithVisibleFeedVideos,
  isVisibleInCreatorFeed,
} from '../supabase/functions/creator-videos/creatorListVisibility.ts';

const overrides = new Map<string, 'hide' | 'show'>([
  ['hidden1', 'hide'],
  ['forced1', 'show'],
]);

const rows = [
  {
    video_id: 'visible1',
    channel_id: 'UC_A',
    title: 'Easy Chicken Dinner Recipe',
    description_snippet: 'weeknight meal',
    is_short: false,
  },
  {
    video_id: 'hidden1',
    channel_id: 'UC_B',
    title: 'Budget Pasta Recipe',
    description_snippet: '',
    is_short: false,
  },
  {
    video_id: 'junk1',
    channel_id: 'UC_C',
    title: 'I Ranked EVERY Food at Costco',
    description_snippet: '',
    is_short: false,
  },
  {
    video_id: 'visible2',
    channel_id: 'UC_B',
    title: 'Sheet Pan Salmon Dinner',
    description_snippet: '',
    is_short: false,
  },
];

assert.equal(isVisibleInCreatorFeed(rows[0], overrides), true);
assert.equal(isVisibleInCreatorFeed(rows[1], overrides), false, 'hide override');
assert.equal(isVisibleInCreatorFeed(rows[2], overrides), false, 'feed filter');
assert.equal(isVisibleInCreatorFeed(rows[3], overrides), true);

const channels = channelIdsWithVisibleFeedVideos(rows, overrides);
assert.deepEqual([...channels].sort(), ['UC_A', 'UC_B']);

console.log('creator-list-visibility-check: ok');
