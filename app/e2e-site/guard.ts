import { test as base } from '@playwright/test';

/**
 * Every test runs with requests to anything but this machine blocked: the site is built with a
 * dummy Supabase address (*.supabase.co) and must never reach a real server, and the 209 pages'
 * outside fonts or scripts are not needed. Blocked addresses are listed on the test's report.
 */
export const test = base.extend<{ blockedRequests: string[] }>({
  blockedRequests: [
    async ({ context }, use, testInfo) => {
      const seen: string[] = [];
      await context.route(
        (url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost',
        async (route) => {
          seen.push(route.request().url());
          await route.abort('blockedbyclient');
        },
      );
      await use(seen);
      const supabase = seen.filter((u) => new URL(u).hostname.toLowerCase().endsWith('.supabase.co'));
      if (seen.length) testInfo.annotations.push({ type: 'blocked outside requests', description: seen.join('\n') });
      if (supabase.length) testInfo.annotations.push({ type: 'blocked supabase.co requests', description: supabase.join('\n') });
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
