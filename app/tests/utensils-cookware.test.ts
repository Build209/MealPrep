/// <reference types="node" />
// Cookware drawings: every item seeded in the database has a drawing, and each stays on its 76 x 100 grid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COOKWARE_H, COOKWARE_PARTS, COOKWARE_W, cookwareParts } from '../src/utensils/cookwareParts';

// The 28 slugs in db/supabase/migrations/20261020000000_utensils_equipment.sql.
const SEEDED = [
  'oven', 'stovetop', 'microwave', 'air_fryer', 'grill', 'smoker', 'slow_cooker', 'pressure_cooker', 'toaster_oven', 'rice_cooker',
  'skillet', 'saucepan', 'stockpot', 'dutch_oven', 'sheet_pan', 'baking_dish', 'wok', 'griddle',
  'chef_knife', 'cutting_board', 'whisk', 'tongs', 'blender', 'food_processor', 'stand_mixer',
  'fork', 'chopsticks', 'bowls',
];

test('every seeded item has a drawing of its own', () => {
  for (const slug of SEEDED) assert.ok((COOKWARE_PARTS[slug]?.length ?? 0) >= 2, `no drawing for ${slug}`);
  assert.equal(Object.keys(COOKWARE_PARTS).length, SEEDED.length, 'a drawing exists for a slug that is not seeded');
});

test('drawings stay near their 76 x 100 grid (a little overhang is allowed for handles)', () => {
  for (const [slug, parts] of Object.entries(COOKWARE_PARTS)) {
    for (const p of parts) {
      const left = Number(p.left);
      const top = Number(p.top);
      assert.ok(left >= -2 && top >= -2, `${slug} starts off the grid`);
      assert.ok(left + Number(p.width) <= COOKWARE_W + 6, `${slug} runs off the right edge`);
      assert.ok(top + Number(p.height) <= COOKWARE_H + 2, `${slug} runs off the bottom`);
    }
  }
});

test('an unknown slug falls back to a drawing for its category', () => {
  assert.ok(cookwareParts('mystery_gadget', 'heat').length > 0);
  assert.ok(cookwareParts('mystery_gadget', 'eating').length > 0);
});
