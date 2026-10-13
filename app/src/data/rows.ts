/**
 * Row models for the tables the app reads, matching the live baseline
 * (db/supabase/migrations/20261013000000_live_baseline.sql) column for column.
 *
 * `...Row` types are exactly what the database sends (snake_case). The app works
 * with the camelCase types. The mapping happens here and nowhere else.
 *
 * Changing a column? Update the Row type, the app type, both mappers, the COLUMNS
 * list and tests/rows.test.ts together.
 */

// ---------------------------------------------------------------- pantry_items

export type PantryItemRow = {
  id: string; // uuid, default gen_random_uuid()
  user_id: string; // uuid, references profiles(id)
  ingredient_id: string;
  name: string;
  category: string;
  quantity: number; // numeric, default 0 (PostgREST may send numeric as a string; see toNumber)
  unit: string;
  location: string | null; // default ''
  photo_url: string | null;
  expires_on: string | null; // date, 'YYYY-MM-DD'
  updated_at: string; // timestamptz, ISO string
  scan_photo_path: string | null;
};

export type PantryItem = {
  id: string;
  userId: string;
  ingredientId: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  location: string | null;
  photoUrl: string | null;
  expiresOn: string | null;
  updatedAt: string;
  scanPhotoPath: string | null;
};

export const PANTRY_ITEM_COLUMNS =
  'id, user_id, ingredient_id, name, category, quantity, unit, location, photo_url, expires_on, updated_at, scan_photo_path';

export function pantryItemFromRow(row: PantryItemRow): PantryItem {
  return {
    id: row.id,
    userId: row.user_id,
    ingredientId: row.ingredient_id,
    name: row.name,
    category: row.category,
    quantity: toNumber(row.quantity),
    unit: row.unit,
    location: row.location,
    photoUrl: row.photo_url,
    expiresOn: row.expires_on,
    updatedAt: row.updated_at,
    scanPhotoPath: row.scan_photo_path,
  };
}

export function pantryItemToRow(item: PantryItem): PantryItemRow {
  return {
    id: item.id,
    user_id: item.userId,
    ingredient_id: item.ingredientId,
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    location: item.location,
    photo_url: item.photoUrl,
    expires_on: item.expiresOn,
    updated_at: item.updatedAt,
    scan_photo_path: item.scanPhotoPath,
  };
}

// -------------------------------------------------------------------- profiles

export type UserRole = 'admin' | 'member'; // enum public.user_role
export type UserPlan = 'free' | 'paid'; // enum public.user_plan
export type PlanTier = 'plus' | 'pro' | 'family'; // check profiles_plan_tier_check

export type ProfileRow = {
  id: string; // uuid, references auth.users(id)
  email: string;
  name: string;
  role: UserRole; // default 'member'
  photo_url: string | null;
  household_size: number; // integer, default 2
  dietary_notes: string | null; // default ''
  created_at: string; // timestamptz
  home_zip: string | null;
  home_lat: number | null;
  home_lng: number | null;
  home_location_updated_at: string | null;
  auto_add_missing_to_grocery: boolean; // default true
  plan: UserPlan; // default 'free'; changed by the server only
  avatar_path: string | null;
  plan_comp: boolean; // default false; admin only
  plan_tier: PlanTier; // default 'plus'; only meaningful while plan = 'paid'
};

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  photoUrl: string | null;
  householdSize: number;
  dietaryNotes: string | null;
  createdAt: string;
  homeZip: string | null;
  homeLat: number | null;
  homeLng: number | null;
  homeLocationUpdatedAt: string | null;
  autoAddMissingToGrocery: boolean;
  plan: UserPlan;
  avatarPath: string | null;
  planComp: boolean;
  planTier: PlanTier;
};

export const PROFILE_COLUMNS =
  'id, email, name, role, photo_url, household_size, dietary_notes, created_at, home_zip, home_lat, home_lng, ' +
  'home_location_updated_at, auto_add_missing_to_grocery, plan, avatar_path, plan_comp, plan_tier';

export function profileFromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    photoUrl: row.photo_url,
    householdSize: row.household_size,
    dietaryNotes: row.dietary_notes,
    createdAt: row.created_at,
    homeZip: row.home_zip,
    homeLat: row.home_lat,
    homeLng: row.home_lng,
    homeLocationUpdatedAt: row.home_location_updated_at,
    autoAddMissingToGrocery: row.auto_add_missing_to_grocery,
    plan: row.plan,
    avatarPath: row.avatar_path,
    planComp: row.plan_comp,
    planTier: row.plan_tier,
  };
}

export function profileToRow(profile: Profile): ProfileRow {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    photo_url: profile.photoUrl,
    household_size: profile.householdSize,
    dietary_notes: profile.dietaryNotes,
    created_at: profile.createdAt,
    home_zip: profile.homeZip,
    home_lat: profile.homeLat,
    home_lng: profile.homeLng,
    home_location_updated_at: profile.homeLocationUpdatedAt,
    auto_add_missing_to_grocery: profile.autoAddMissingToGrocery,
    plan: profile.plan,
    avatar_path: profile.avatarPath,
    plan_comp: profile.planComp,
    plan_tier: profile.planTier,
  };
}

/** True when the signed-in person has paid access (paid plan or an admin-granted comp). */
export function hasPaidAccess(profile: Pick<Profile, 'plan' | 'planComp'>): boolean {
  return profile.plan === 'paid' || profile.planComp;
}

// --------------------------------------------------------------------- helpers

/** Postgres numeric can arrive as a string; the app always works with numbers. */
function toNumber(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
