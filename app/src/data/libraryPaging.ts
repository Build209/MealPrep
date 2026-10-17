/**
 * Reads every published library recipe, a page at a time. The server caps one answer at 1,000
 * rows whatever `.limit()` says, so a single read of a library bigger than that is silently cut
 * short. Pages are asked for together, then joined in id order.
 */
export const LIBRARY_PAGE_SIZE = 1000;
/** Safety stop so a runaway table can't stall a phone (about 10x today's library). */
export const LIBRARY_MAX_ROWS = 10_000;

export async function readAllPages<T>(readPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < LIBRARY_MAX_ROWS; from += LIBRARY_PAGE_SIZE) {
    const page = await readPage(from, from + LIBRARY_PAGE_SIZE - 1);
    out.push(...page);
    if (page.length < LIBRARY_PAGE_SIZE) break;
  }
  return out;
}
