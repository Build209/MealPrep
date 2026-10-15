/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PANTRY_ITEM_COLUMNS,
  PROFILE_COLUMNS,
  hasPaidAccess,
  pantryItemFromRow,
  pantryItemToRow,
  profileFromRow,
  profileToRow,
  type PantryItemRow,
  type ProfileRow,
} from '../src/data/rows';

const pantryRow: PantryItemRow = {
  id: '11111111-1111-1111-1111-111111111111',
  user_id: '22222222-2222-2222-2222-222222222222',
  ingredient_id: 'onion',
  name: 'Onion',
  category: 'produce',
  quantity: 3,
  unit: 'each',
  location: 'pantry',
  photo_url: null,
  expires_on: '2026-10-20',
  updated_at: '2026-10-13T12:00:00+00:00',
  scan_photo_path: null,
};

const profileRow: ProfileRow = {
  id: '22222222-2222-2222-2222-222222222222',
  email: 'cook@example.com',
  name: 'Cook',
  role: 'member',
  photo_url: null,
  household_size: 2,
  dietary_notes: '',
  created_at: '2026-01-01T00:00:00+00:00',
  home_zip: '95340',
  home_lat: 37.3,
  home_lng: -120.5,
  home_location_updated_at: null,
  auto_add_missing_to_grocery: true,
  plan: 'free',
  avatar_path: null,
  plan_comp: false,
  plan_tier: 'plus',
};

test('pantry row maps to camelCase and back unchanged', () => {
  const item = pantryItemFromRow(pantryRow);
  assert.equal(item.userId, pantryRow.user_id);
  assert.equal(item.ingredientId, 'onion');
  assert.equal(item.expiresOn, '2026-10-20');
  assert.equal(item.scanPhotoPath, null);
  assert.deepEqual(pantryItemToRow(item), pantryRow);
});

test('pantry quantity sent as a numeric string becomes a number', () => {
  const item = pantryItemFromRow({ ...pantryRow, quantity: '2.5' as unknown as number });
  assert.equal(item.quantity, 2.5);
});

test('profile row maps to camelCase and back unchanged', () => {
  const profile = profileFromRow(profileRow);
  assert.equal(profile.householdSize, 2);
  assert.equal(profile.autoAddMissingToGrocery, true);
  assert.equal(profile.planTier, 'plus');
  assert.deepEqual(profileToRow(profile), profileRow);
});

test('mapped objects use only camelCase keys', () => {
  for (const obj of [pantryItemFromRow(pantryRow), profileFromRow(profileRow)]) {
    for (const key of Object.keys(obj)) assert.ok(!key.includes('_'), `unexpected snake_case key ${key}`);
  }
});

function columnsFromList(list: string): string[] {
  return list.split(',').map((c) => c.trim());
}

const baselinePath = join(__dirname, '..', '..', 'db', 'supabase', 'migrations', '20261013000000_live_baseline.sql');

/** Column names of `create table public.<name>` in the live baseline, in order. */
function baselineColumns(table: string): string[] {
  const sql = readFileSync(baselinePath, 'utf8');
  const start = sql.indexOf(`create table public.${table} (`);
  assert.ok(start >= 0, `table ${table} not found in baseline`);
  const body = sql.slice(start, sql.indexOf('\n);', start));
  return body
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0] ?? '')
    .filter((name) => name.length > 0);
}

test('column lists and row types match the live baseline exactly', () => {
  assert.deepEqual(columnsFromList(PANTRY_ITEM_COLUMNS), baselineColumns('pantry_items'));
  assert.deepEqual(columnsFromList(PROFILE_COLUMNS), baselineColumns('profiles'));
  assert.deepEqual(Object.keys(pantryRow), baselineColumns('pantry_items'));
  assert.deepEqual(Object.keys(profileRow), baselineColumns('profiles'));
});

test('paid access: paid plan or comp', () => {
  assert.equal(hasPaidAccess({ plan: 'free', planComp: false }), false);
  assert.equal(hasPaidAccess({ plan: 'paid', planComp: false }), true);
  assert.equal(hasPaidAccess({ plan: 'free', planComp: true }), true);
});
