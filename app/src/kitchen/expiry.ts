/**
 * Use-by date helpers, copied from the old app (mobile/lib/pantry/expiry.ts).
 * Dates are calendar days 'YYYY-MM-DD'; today is the device's local calendar day.
 */

/** Anything with a use-by date (a pantry row). */
type Dated = { expiresOn?: string | null };

/** Calendar date `YYYY-MM-DD` (UTC-safe day arithmetic). */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const base = parseIsoDateOnly(isoDate);
  if (!base) return isoDate;
  base.setUTCDate(base.getUTCDate() + days);
  return formatIsoDateOnly(base);
}

export function formatIsoDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIsoDate(now = new Date()): string {
  return formatIsoDateOnly(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function parseIsoDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/** Subtle pantry list label, e.g. "exp Oct 12". */
export function formatPantryExpiryShort(expiresOn: string | null | undefined): string | null {
  if (!expiresOn) return null;
  const parsed = parseIsoDateOnly(expiresOn.slice(0, 10));
  if (!parsed) return null;
  const label = parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `exp ${label}`;
}

export function estimateExpiryFromShelfLife(shelfLifeDays: number, now = new Date()): string {
  return addDaysToIsoDate(todayIsoDate(now), shelfLifeDays);
}

/** True when `expiresOn` is strictly before today (UTC calendar day). */
export function isPantryItemExpired(
  item: Dated,
  now = new Date(),
): boolean {
  if (!item.expiresOn) return false;
  const exp = parseIsoDateOnly(item.expiresOn.slice(0, 10));
  if (!exp) return false;
  const today = parseIsoDateOnly(todayIsoDate(now));
  if (!today) return false;
  return exp.getTime() < today.getTime();
}

/** True when `expiresOn` is today or later but on or before `now + days` (inclusive). */
export function isExpiringSoon(item: Dated, days = 7, now = new Date()): boolean {
  if (!item.expiresOn) return false;
  if (isPantryItemExpired(item, now)) return false;
  const exp = parseIsoDateOnly(item.expiresOn.slice(0, 10));
  if (!exp) return false;
  const today = parseIsoDateOnly(todayIsoDate(now));
  if (!today) return false;
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + days);
  return exp.getTime() <= horizon.getTime();
}

/** Whole calendar days from today until `expiresOn` (0 = today, negative = expired). Null when no valid date. */
export function daysUntilPantryExpiry(item: Dated, now = new Date()): number | null {
  if (!item.expiresOn) return null;
  const exp = parseIsoDateOnly(item.expiresOn.slice(0, 10));
  if (!exp) return null;
  const today = parseIsoDateOnly(todayIsoDate(now));
  if (!today) return null;
  return Math.round((exp.getTime() - today.getTime()) / 86_400_000);
}

/** Use-soon badge label, e.g. "1 day left". Null when the item has no date or is already expired. */
export function formatPantryDaysLeft(item: Dated, now = new Date()): string | null {
  const days = daysUntilPantryExpiry(item, now);
  if (days === null || days < 0) return null;
  if (days === 0) return 'Use today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}
