import { RECIPE_RANKING } from '../../config/recipeRanking';
import { readJson, removeStorageKey, writeJson } from '../storage';
import {
  applyEngagementEventToIndex,
  readEngagementIndex,
  rebuildEngagementIndex,
  writeEngagementIndex,
  type EngagementIndexV2,
} from './engagementIndex';
import { defaultTasteMetaForEvent } from './eventMeta';
import type {
  RecipeEngagementEvent,
  RecipeEngagementEventType,
  RecipeEngagementEventV2,
} from './types';

function storageKey(ownerId: string): string {
  if (!ownerId || ownerId === 'guest') {
    return RECIPE_RANKING.guestEventsStorageKey;
  }
  return `${RECIPE_RANKING.eventsStoragePrefix}.${ownerId}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Where a signed-in account's events also go (lib/learningSync sets it; null for guests). This
 * file stays free of network code: it only reports what was added or removed.
 */
export interface RecipeEngagementRemote {
  added(ownerId: string, event: RecipeEngagementEvent): void;
  wontCookCleared(ownerId: string, refKey: string): void;
}

let engagementRemote: RecipeEngagementRemote | null = null;

export function setRecipeEngagementRemote(next: RecipeEngagementRemote | null): void {
  engagementRemote = next;
}

/** Events worth keeping with the account. Impressions are noise at many per screen. */
export function isSyncedEngagementType(type: RecipeEngagementEventType): boolean {
  return type !== 'impression';
}

const eventIdentity = (event: RecipeEngagementEvent) => `${event.refKey}|${event.type}|${event.at}`;

/**
 * Folds the account's saved events into this device's, oldest first, without repeats.
 * Returns the merged list and the device-only events the account does not have yet.
 */
export function mergeRemoteEngagementEvents(
  local: readonly RecipeEngagementEvent[],
  remoteEvents: readonly RecipeEngagementEvent[],
): { merged: RecipeEngagementEvent[]; missingRemotely: RecipeEngagementEvent[] } {
  const remoteIds = new Set(remoteEvents.map(eventIdentity));
  const seen = new Set<string>();
  const merged: RecipeEngagementEvent[] = [];
  for (const event of [...remoteEvents, ...local]) {
    const id = eventIdentity(event);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(event);
  }
  merged.sort((a, b) => (a.v2?.ts ?? Date.parse(a.at)) - (b.v2?.ts ?? Date.parse(b.at)));
  const missingRemotely = local.filter(
    (event) => isSyncedEngagementType(event.type) && !remoteIds.has(eventIdentity(event)),
  );
  return { merged, missingRemotely };
}

/** Replaces the owner's events and rebuilds the taste index from them (after a merge). */
export function replaceRecipeEngagementEvents(ownerId: string, events: RecipeEngagementEvent[]): void {
  const trimmed = trimEvents(events);
  writeJson(storageKey(ownerId), trimmed);
  writeEngagementIndex(ownerId, rebuildEngagementIndex(trimmed, defaultTasteMetaForEvent));
}

export function readRecipeEngagementEvents(ownerId: string): RecipeEngagementEvent[] {
  const raw = readJson<RecipeEngagementEvent[]>(storageKey(ownerId), []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row) =>
      row &&
      typeof row.refKey === 'string' &&
      typeof row.type === 'string' &&
      typeof row.at === 'string',
  );
}

function trimEvents(events: RecipeEngagementEvent[]): RecipeEngagementEvent[] {
  const maxEvents = RECIPE_RANKING.maxStoredEvents;
  const maxAgeMs = RECIPE_RANKING.maxStoredAgeDays * MS_PER_DAY;
  const now = Date.now();
  let trimmed = events;
  if (trimmed.length > maxEvents) {
    trimmed = trimmed.slice(trimmed.length - maxEvents);
  }
  trimmed = trimmed.filter((event) => {
    const ts = event.v2?.ts ?? Date.parse(event.at);
    return Number.isFinite(ts) && now - ts <= maxAgeMs;
  });
  return trimmed;
}

export function writeRecipeEngagementEvents(
  ownerId: string,
  events: RecipeEngagementEvent[],
): void {
  writeJson(storageKey(ownerId), trimEvents(events));
}

function ensureIndex(ownerId: string, events: RecipeEngagementEvent[]): EngagementIndexV2 {
  const existing = readEngagementIndex(ownerId);
  if (existing) return existing;
  const built = rebuildEngagementIndex(events, defaultTasteMetaForEvent);
  writeEngagementIndex(ownerId, built);
  return built;
}

export function readEngagementIndexForOwner(ownerId: string): EngagementIndexV2 {
  const events = readRecipeEngagementEvents(ownerId);
  return ensureIndex(ownerId, events);
}

export function appendRecipeEngagementEvent(
  ownerId: string,
  event: RecipeEngagementEvent,
  existing?: RecipeEngagementEvent[],
): RecipeEngagementEvent[] {
  const base = existing ?? readRecipeEngagementEvents(ownerId);
  const next = trimEvents([...base, event]);
  writeRecipeEngagementEvents(ownerId, next);

  const index = readEngagementIndex(ownerId) ?? rebuildEngagementIndex(base, defaultTasteMetaForEvent);
  applyEngagementEventToIndex(index, event, defaultTasteMetaForEvent(event.refKey, event));
  writeEngagementIndex(ownerId, index);
  if (engagementRemote && isSyncedEngagementType(event.type)) engagementRemote.added(ownerId, event);
  return next;
}

export function shouldLogImpression(
  refKey: string,
  events: readonly RecipeEngagementEvent[],
  nowMs: number = Date.now(),
): boolean {
  const windowStart = nowMs - RECIPE_RANKING.impressionDedupeMs;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.refKey !== refKey || event.type !== 'impression') continue;
    const atMs = Date.parse(event.at);
    if (Number.isFinite(atMs) && atMs >= windowStart) {
      return false;
    }
    break;
  }
  return true;
}

export function createEngagementEvent(
  refKey: string,
  type: RecipeEngagementEventType,
  at: string = new Date().toISOString(),
): RecipeEngagementEvent {
  return { refKey, type, at };
}

export function createSeamlessEngagementEvent(
  refKey: string,
  type: Extract<
    RecipeEngagementEventType,
    | 'plan'
    | 'cook_now'
    | 'just_save'
    | 'skip'
    | 'import'
    | 'ghost_confirm'
    | 'ghost_override'
    | 'cook_confirmed'
    | 'cook_declined'
  >,
  v2: RecipeEngagementEventV2,
): RecipeEngagementEvent {
  const ts = v2.ts ?? Date.now();
  return {
    refKey,
    type,
    at: new Date(ts).toISOString(),
    v2: { ...v2, ts },
  };
}

export function clearWontCookForRef(
  ownerId: string,
  refKey: string,
  existing?: RecipeEngagementEvent[],
): RecipeEngagementEvent[] {
  const base = existing ?? readRecipeEngagementEvents(ownerId);
  const next = base.filter((event) => !(event.refKey === refKey && event.type === 'wont_cook'));
  writeRecipeEngagementEvents(ownerId, next);
  engagementRemote?.wontCookCleared(ownerId, refKey);
  return next;
}

export function clearRecipeEngagementForOwner(ownerId: string): void {
  if (!ownerId) return;
  removeStorageKey(storageKey(ownerId));
  removeStorageKey(`${RECIPE_RANKING.eventsStoragePrefix}.${ownerId}.indexV2`);
}
