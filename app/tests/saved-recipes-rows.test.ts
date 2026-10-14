/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addItem, replaceItem, rollback } from '../src/data/listOps';
import {
  isTargetSaved,
  parseSavedRefKey,
  placeholderSaved,
  refKeysToRemove,
  removeMatching,
  saveTargetForCreatorVideo,
  saveTargetForRecipe,
  saveTargetFromSaved,
  savedInsertColumns,
  savedLinkFromRow,
  savedRecipeFromRow,
  savedRefKeyCreator,
  savedRefKeyKitchen,
  slugsToResolve,
  type SavedRecipe,
  type SavedRecipeRow,
} from '../src/data/savedRecipeRows';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const brisket = { routeId: `r_${U1}`, table: 'recipes' as const, uuid: U1, legacyId: 'brisket', title: 'Brisket', imageUrl: null };
const curry = { routeId: `l_${U2}`, table: 'library_recipes' as const, uuid: U2, legacyId: 'library-thai-curry', title: 'Thai Curry', imageUrl: null };
const video = {
  videoId: 'abc123',
  channelId: 'ch',
  title: 'Easy pasta',
  thumbnailUrl: 'https://example.com/t.jpg',
  watch: { url: 'https://www.youtube.com/watch?v=abc123', label: 'Watch on YouTube' },
  creatorName: 'Chef',
  viewCount: 1,
  publishedAt: null,
};

test('keys match the old app (kitchen:, creator:, mealdb:)', () => {
  assert.equal(savedRefKeyKitchen('brisket'), 'kitchen:brisket');
  assert.equal(savedRefKeyCreator(' abc123 '), 'creator:abc123');
  assert.deepEqual(parseSavedRefKey('kitchen:library-thai-curry'), { type: 'kitchen', id: 'library-thai-curry' });
  assert.deepEqual(parseSavedRefKey('mealdb:52772'), { type: 'mealdb', id: '52772' });
  assert.deepEqual(parseSavedRefKey('creator:a:b'), { type: 'creator', id: 'a:b' });
  assert.equal(parseSavedRefKey('kitchen:'), null);
  assert.equal(parseSavedRefKey('other:x'), null);
});

test('recipe targets: old key, uuid only for recipes rows, old preview shape plus appRoute', () => {
  const t = saveTargetForRecipe(brisket);
  assert.equal(t.refKey, 'kitchen:brisket');
  assert.equal(t.sourceType, 'kitchen');
  assert.equal(t.kitchenRecipeId, U1);
  assert.equal(t.preview.kind, 'mealdb');
  assert.equal(t.preview.appRoute, `r_${U1}`);
  assert.equal((t.preview.shape as { id: string }).id, 'brisket');
  assert.deepEqual(t.link, { kind: 'recipe', routeId: `r_${U1}` });
  const lib = saveTargetForRecipe(curry);
  assert.equal(lib.refKey, 'kitchen:library-thai-curry');
  assert.equal(lib.kitchenRecipeId, null); // the foreign key only allows recipes rows
  assert.throws(() => saveTargetForRecipe({ ...brisket, legacyId: ' ' }), /can't be saved/);
});

test('creator targets: old creator item preview, watch link', () => {
  const t = saveTargetForCreatorVideo(video);
  assert.equal(t.refKey, 'creator:abc123');
  assert.equal(t.sourceType, 'creator_video');
  assert.equal(t.creatorWatchUrl, video.watch.url);
  assert.equal((t.preview.item as { watchUrl: string }).watchUrl, video.watch.url);
  assert.equal(t.preview.kind, 'creator');
  const cols = savedInsertColumns(ME, t);
  assert.equal(cols.user_id, ME);
  assert.equal(cols.ref_key, 'creator:abc123');
  assert.equal(cols.mealdb_id, null);
});

function savedRow(over: Partial<SavedRecipeRow>): SavedRecipeRow {
  return {
    id: U1,
    user_id: ME,
    ref_key: 'kitchen:brisket',
    source_type: 'kitchen',
    kitchen_recipe_id: null,
    creator_video_id: null,
    creator_watch_url: null,
    mealdb_id: null,
    title: 'Brisket',
    image_url: null,
    preview: {},
    created_at: '2026-10-14T00:00:00Z',
    ...over,
  };
}

test('links from rows: appRoute, uuid, slug lookups, videos, old mealdb rows', () => {
  assert.deepEqual(savedLinkFromRow(savedRow({ preview: { appRoute: `l_${U2}` } })), { kind: 'recipe', routeId: `l_${U2}` });
  assert.deepEqual(savedLinkFromRow(savedRow({ preview: { appRoute: 'l_bad' }, kitchen_recipe_id: U1 })), { kind: 'recipe', routeId: `r_${U1}` });
  assert.deepEqual(savedLinkFromRow(savedRow({ ref_key: `kitchen:${U2}` })), { kind: 'recipe', routeId: `r_${U2}` });
  const lookup = { recipes: new Map([['brisket', U1]]), library: new Map([['thai-curry', U2]]) };
  assert.deepEqual(savedLinkFromRow(savedRow({}), lookup), { kind: 'recipe', routeId: `r_${U1}` });
  assert.deepEqual(savedLinkFromRow(savedRow({ ref_key: 'kitchen:library-thai-curry' }), lookup), { kind: 'recipe', routeId: `l_${U2}` });
  assert.deepEqual(savedLinkFromRow(savedRow({ ref_key: 'kitchen:gone' }), lookup), { kind: 'none' });
  assert.deepEqual(savedLinkFromRow(savedRow({ ref_key: 'mealdb:1', source_type: 'mealdb' })), { kind: 'none' });
  assert.deepEqual(
    savedLinkFromRow(savedRow({ ref_key: 'creator:abc', source_type: 'creator_video', creator_watch_url: 'https://youtu.be/abc' })),
    { kind: 'video', url: 'https://youtu.be/abc', label: 'Watch on YouTube' },
  );
  assert.deepEqual(
    savedLinkFromRow(savedRow({ ref_key: 'creator:abc', source_type: 'creator_video', preview: { kind: 'creator', item: { watchUrl: 'https://www.youtube.com/watch?v=abc' } } })).kind,
    'video',
  );
  assert.deepEqual(savedLinkFromRow(savedRow({ ref_key: 'creator:abc', source_type: 'creator_video', creator_watch_url: 'javascript:x' })), { kind: 'none' });
});

test('slugsToResolve: only old kitchen rows without a uuid or appRoute', () => {
  assert.deepEqual(slugsToResolve(savedRow({})), { recipes: ['brisket'], library: [] });
  assert.deepEqual(slugsToResolve(savedRow({ ref_key: 'kitchen:library-thai-curry' })), { recipes: [], library: ['thai-curry'] });
  assert.deepEqual(slugsToResolve(savedRow({ kitchen_recipe_id: U1 })), { recipes: [], library: [] });
  assert.deepEqual(slugsToResolve(savedRow({ preview: { appRoute: `r_${U1}` } })), { recipes: [], library: [] });
  assert.deepEqual(slugsToResolve(savedRow({ ref_key: 'creator:x', source_type: 'creator_video' })), { recipes: [], library: [] });
});

test('savedRecipeFromRow: clean title, unknown source type read from the key', () => {
  const s = savedRecipeFromRow(savedRow({ title: ' Brisket\u0000 ', source_type: 'weird', ref_key: 'creator:x', creator_watch_url: 'https://youtu.be/x' }));
  assert.equal(s.title, 'Brisket');
  assert.equal(s.sourceType, 'creator_video');
});

test('saved state and optimistic save/unsave with targeted rollback (old applySavedToggle checks)', () => {
  const target = saveTargetForRecipe(brisket);
  const other = saveTargetForCreatorVideo(video);
  let list: SavedRecipe[] = [];
  assert.equal(isTargetSaved(list, target), false);
  assert.equal(isTargetSaved(undefined, target), false);

  // Save: the placeholder shows first, then the server row replaces it.
  const add = addItem(placeholderSaved('temp-1', target), 'start');
  list = add.apply(list);
  assert.equal(isTargetSaved(list, target), true);
  const server = savedRecipeFromRow(savedRow({ id: U2, kitchen_recipe_id: U1, preview: { appRoute: `r_${U1}` } }));
  list = replaceItem(list, server, 'temp-1');
  assert.deepEqual(list.map((s) => s.id), [U2]);

  // Save another, then its save fails while the list has moved on: only that one is undone.
  const addOther = addItem(placeholderSaved('temp-2', other), 'start');
  const snapshot = list;
  const applied = addOther.apply(list);
  const movedOn = [...applied];
  const rolled = rollback(movedOn, snapshot, applied, addOther);
  assert.equal(isTargetSaved(rolled, target), true, 'rolling back one save keeps the other saved rows');
  assert.equal(isTargetSaved(rolled, other), false);

  // A row the old app saved under the same recipes uuid counts as saved too, and is removed with it.
  const legacy = savedRecipeFromRow(savedRow({ id: 'x', ref_key: `kitchen:${U1}`, kitchen_recipe_id: U1 }));
  const both = [server, legacy];
  assert.deepEqual(refKeysToRemove(both, target).sort(), ['kitchen:brisket', `kitchen:${U1}`].sort());
  const remove = removeMatching(target);
  const afterRemove = remove.apply(both);
  assert.equal(afterRemove.length, 0);
  assert.deepEqual(remove.revert(afterRemove, both).map((s) => s.id), [U2, 'x']);
  // Undo never duplicates a row that came back by itself.
  assert.deepEqual(remove.revert([server], both).map((s) => s.id), [U2, 'x']);
});

test('saveTargetFromSaved keeps the key and uuid, so the saved list can remove it', () => {
  const s = savedRecipeFromRow(savedRow({ kitchen_recipe_id: U1 }));
  const t = saveTargetFromSaved(s);
  assert.equal(t.refKey, 'kitchen:brisket');
  assert.equal(t.kitchenRecipeId, U1);
  assert.equal(isTargetSaved([s], t), true);
});
