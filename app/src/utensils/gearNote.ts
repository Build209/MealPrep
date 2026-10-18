import { GEAR_COPY as COPY } from './copy';
import type { GearStatus } from './gear';

/**
 * The small line under a recipe card. Unknown and ready recipes get nothing. A swap says "could work"
 * (the swap rules are untested with real food, so nothing stronger); missing gear lists what is needed.
 */
export function gearNote(status: GearStatus, nameOf: (slug: string) => string): string | null {
  if (status.kind === 'works') return COPY.couldWorkWith(status.via.map((v) => nameOf(v.canUse).toLowerCase()).join(' and '));
  if (status.kind === 'needs') return COPY.needs(status.missing.map(nameOf).join(', '));
  return null;
}
