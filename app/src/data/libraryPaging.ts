/**
 * Reads every published library recipe, a page at a time. The server caps one answer at 1,000
 * rows whatever `.limit()` says, so a single read of a library bigger than that is silently cut
 * short. Pages come back in id order.
 */
export const LIBRARY_PAGE_SIZE = 1000;
/** Safety stop so a runaway table can't stall a phone (about 10x today's library). */
export const LIBRARY_MAX_ROWS = 10_000;
/** Pages read at the same time after the first. */
const PAGES_AT_ONCE = 3;

export async function readAllPages<T>(readPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const pageAt = (from: number) => readPage(from, from + LIBRARY_PAGE_SIZE - 1);
  const first = await pageAt(0);
  if (first.length < LIBRARY_PAGE_SIZE) return first;
  // The first page told us the library is bigger than one page. Ask for a few pages at a time instead
  // of one after another (four sequential reads took about 3 s on the live site).
  const out: T[] = [...first];
  for (let from = LIBRARY_PAGE_SIZE; from < LIBRARY_MAX_ROWS; from += LIBRARY_PAGE_SIZE * PAGES_AT_ONCE) {
    const starts = Array.from({ length: PAGES_AT_ONCE }, (_, i) => from + i * LIBRARY_PAGE_SIZE).filter((f) => f < LIBRARY_MAX_ROWS);
    const pages = await Promise.all(starts.map(pageAt));
    for (const page of pages) out.push(...page);
    if (pages.some((page) => page.length < LIBRARY_PAGE_SIZE)) break;
  }
  return out;
}
