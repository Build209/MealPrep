import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Screen checks for the phone pass (playwright.phone.config.ts, e2e/phone-tour.spec.ts).
 * Every tour screen gets: a full-page screenshot, then four automatic checks, each written to
 * phone-screens/<project>/<NN>-<screen>.json for e2e/phone-report.mjs to merge:
 *  1. no sideways scroll on the page;
 *  2. every visible button, link, checkbox, radio, tab or switch is at least 44x44 CSS px;
 *  3. no visible text cut off by its box (best effort);
 *  4. tomato (#D9301A) only in a camera or money context.
 * Failures are soft (expect.soft), so one bad screen still leaves the screenshot and the report.
 */

export const OUT_DIR = join(__dirname, '..', 'phone-screens');
export const MIN_TAP = 44;
export const TOMATO = 'rgb(217, 48, 26)';

/** What a screen is for, as far as the tomato rule goes. */
export type Purpose = 'camera' | 'money' | 'none';

type TapIssue = { text: string; role: string; width: number; height: number };
type ClipIssue = { text: string; kind: string; scroll: string; client: string };
type TomatoUse = { text: string; tag: string; props: string[]; context: 'camera' | 'money' | 'brand' | 'none' };
type Measured = {
  scrollWidth: number;
  innerWidth: number;
  innerHeight: number;
  tap: TapIssue[];
  tapAllowed: (TapIssue & { why: string })[];
  clipped: ClipIssue[];
  truncated: ClipIssue[];
  offscreen: string[];
  tomato: TomatoUse[];
  scrollerOverflow: number;
};

/**
 * Runs in the page. Self-contained (no closures over Node values).
 *
 * Tap-target allowlist (kept small on purpose):
 *  - "inline-link": a link that is part of a sentence (display: inline inside a text block with other
 *    words), e.g. "See Terms." or "Terms" in the 18+ line. WCAG 2.5.8 exempts inline targets, and
 *    making them 44px tall would break the sentence.
 *  - "inside-larger-target": a control nested in a bigger tappable element (the outer one, at least
 *    44x44, is what a finger hits).
 *
 * Tomato allowlist: "brand", the "Plan" in the MealPlanatic wordmark in the banana top bar. It is the
 * approved logo (src/ui/TopBar.tsx), not a control or a message, so it is reported but never fails.
 */
function measure({ minTap, tomato }: { minTap: number; tomato: string }): Measured {
  const visible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const anyEl = el as Element & { checkVisibility?: (o: object) => boolean };
    if (typeof anyEl.checkVisibility === 'function') {
      return anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true });
    }
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const label = (el: Element): string => {
    const t = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length > 80 ? `${t.slice(0, 77)}...` : t;
  };
  const ownText = (el: Element): string =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent || '')
      .join('')
      .trim();

  const TAP_SELECTOR =
    'button, a[href], input[type="checkbox"], input[type="radio"], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="switch"], [role="menuitem"]';
  const tappable = Array.from(document.querySelectorAll(TAP_SELECTOR)).filter(visible);
  const tap: TapIssue[] = [];
  const tapAllowed: (TapIssue & { why: string })[] = [];
  for (const el of tappable) {
    const r = el.getBoundingClientRect();
    if (r.width + 0.5 >= minTap && r.height + 0.5 >= minTap) continue;
    const issue = {
      text: label(el),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      width: Math.round(r.width * 10) / 10,
      height: Math.round(r.height * 10) / 10,
    };
    const s = getComputedStyle(el);
    const parent = el.parentElement;
    const inline =
      s.display === 'inline' &&
      !!parent &&
      (parent.textContent || '').replace(/\s+/g, ' ').trim().length > (el.textContent || '').replace(/\s+/g, ' ').trim().length;
    if (inline) {
      tapAllowed.push({ ...issue, why: 'inline-link' });
      continue;
    }
    let outer: Element | null = el.parentElement;
    let covered = false;
    while (outer && outer !== document.body) {
      if (outer.matches(TAP_SELECTOR) && visible(outer)) {
        const o = outer.getBoundingClientRect();
        if (o.width + 0.5 >= minTap && o.height + 0.5 >= minTap) covered = true;
        break;
      }
      outer = outer.parentElement;
    }
    if (covered) {
      tapAllowed.push({ ...issue, why: 'inside-larger-target' });
      continue;
    }
    tap.push(issue);
  }

  // Text cut off: an element with its own text whose content is bigger than its box.
  //  - "clipped" (fails): overflow hidden/clip, no ellipsis or line clamp, content > box.
  //  - "spills" (fails): overflow visible and the text runs wider than its box.
  //  - "truncated" (reported only): ellipsis / line clamp, i.e. numberOfLines on purpose.
  const clipped: ClipIssue[] = [];
  const truncated: ClipIssue[] = [];
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (!ownText(el)) continue;
    if (!visible(el)) continue;
    const h = el as HTMLElement;
    if (h.clientWidth === 0 && h.clientHeight === 0) continue; // inline boxes
    const s = getComputedStyle(el);
    const overX = h.scrollWidth - h.clientWidth;
    const overY = h.scrollHeight - h.clientHeight;
    const hidden = (v: string) => v === 'hidden' || v === 'clip';
    const scrolls = (v: string) => v === 'auto' || v === 'scroll';
    const clamp = s.getPropertyValue('-webkit-line-clamp');
    const intentional = s.textOverflow === 'ellipsis' || (!!clamp && clamp !== 'none');
    const info = {
      text: label(el),
      kind: '',
      scroll: `${h.scrollWidth}x${h.scrollHeight}`,
      client: `${h.clientWidth}x${h.clientHeight}`,
    };
    if ((hidden(s.overflowX) && overX > 1) || (hidden(s.overflowY) && overY > 2)) {
      if (intentional) truncated.push({ ...info, kind: 'truncated' });
      else clipped.push({ ...info, kind: 'clipped' });
    } else if (!hidden(s.overflowX) && !scrolls(s.overflowX) && overX > 1 && s.whiteSpace !== 'nowrap') {
      clipped.push({ ...info, kind: 'spills' });
    }
  }

  // Off the right or left edge (a note, not a failure: sideways scrollers like the creator row are fine).
  const offscreen: string[] = [];
  const iw = window.innerWidth;
  const inScroller = (el: Element): boolean => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const s = getComputedStyle(p);
      if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden') return true;
      p = p.parentElement;
    }
    return false;
  };
  for (const el of tappable) {
    const r = el.getBoundingClientRect();
    if ((r.right > iw + 1 || r.left < -1) && !inScroller(el)) offscreen.push(label(el));
  }

  // Tomato: own text colour, background, or a drawn border / SVG paint.
  const tomatoUses: TomatoUse[] = [];
  const contextOf = (el: Element): TomatoUse['context'] => {
    if ((el.textContent || '').trim() === 'Plan' && el.closest('[aria-label="MealPlanatic"]')) return 'brand';
    let node: Element | null = el;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      const words = `${node.getAttribute('aria-label') || ''} ${node.getAttribute('data-testid') || ''} ${
        depth < 3 ? (node as HTMLElement).innerText || '' : ''
      }`;
      if (/\b(scan|scans|camera|photo|receipt)\b/i.test(words)) return 'camera';
      if (/subscribe|subscription|\$\s?\d|\bplans?\b|purchase|buy-button|checkout|upgrade|price/i.test(words)) return 'money';
    }
    return 'none';
  };
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const props: string[] = [];
    if (s.color === tomato && ownText(el)) props.push('color');
    if (s.backgroundColor === tomato) props.push('background');
    for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
      const w = parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`));
      if (w > 0 && s.getPropertyValue(`border-${side.toLowerCase()}-color`) === tomato && s.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none') {
        props.push(`border-${side.toLowerCase()}`);
        break;
      }
    }
    if (el instanceof SVGElement) {
      if (s.fill === tomato) props.push('fill');
      if (s.stroke === tomato) props.push('stroke');
    }
    if (props.length === 0) continue;
    tomatoUses.push({ text: label(el) || label(el.parentElement ?? el), tag: el.tagName.toLowerCase(), props, context: contextOf(el) });
  }

  // How much a page-level inner scroller hides below the fold (for a second screenshot).
  let scrollerOverflow = 0;
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const s = getComputedStyle(el);
    if (!(s.overflowY === 'auto' || s.overflowY === 'scroll')) continue;
    const h = el as HTMLElement;
    if (!visible(el) || h.clientHeight < window.innerHeight * 0.4) continue;
    scrollerOverflow = Math.max(scrollerOverflow, h.scrollHeight - h.clientHeight);
  }

  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    tap,
    tapAllowed,
    clipped,
    truncated,
    offscreen,
    tomato: tomatoUses,
    scrollerOverflow,
  };
}

/** Scrolls the biggest visible inner scroller to the bottom (RN-web screens scroll inside a View). */
function scrollInnerToBottom(): boolean {
  let best: HTMLElement | null = null;
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
    const s = getComputedStyle(el);
    if (!(s.overflowY === 'auto' || s.overflowY === 'scroll')) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height < window.innerHeight * 0.4) continue;
    if (el.scrollHeight - el.clientHeight < 40) continue;
    if (!best || el.scrollHeight > best.scrollHeight) best = el;
  }
  if (!best) return false;
  best.scrollTop = best.scrollHeight;
  return true;
}

function scrollInnerToTop() {
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
    if (el.scrollTop > 0) el.scrollTop = 0;
  }
}

export type ScreenResult = {
  project: string;
  engine: string;
  order: string;
  screen: string;
  route: string;
  purpose: Purpose;
  viewport: string;
  screenshots: string[];
  checks: { noSidewaysScroll: boolean; tapTargets: boolean; textFits: boolean; tomatoRule: boolean };
  sidewaysScroll: { scrollWidth: number; innerWidth: number };
  tapTargetIssues: TapIssue[];
  tapTargetAllowed: (TapIssue & { why: string })[];
  clippedText: ClipIssue[];
  truncatedText: ClipIssue[];
  offscreenControls: string[];
  tomato: TomatoUse[];
  tomatoViolations: TomatoUse[];
  notes: string[];
  reportOnly: { tapTargets?: string };
};

/**
 * Screenshot + checks for one screen. `order` is the two-digit prefix ("03"), `screen` the slug.
 * `purpose` is the screen's own camera/money purpose: on such screens every tomato use is
 * reported; elsewhere tomato must sit inside a camera or money control (or be the wordmark).
 */
export async function checkScreen(
  page: Page,
  testInfo: TestInfo,
  opts: {
    order: string;
    screen: string;
    purpose: Purpose;
    notes?: string[];
    /** Tap-target issues are reported but do not fail, with this reason (only for files this repo may not change). */
    tapReportOnly?: string;
  },
): Promise<ScreenResult> {
  const project = testInfo.project.name;
  const dir = join(OUT_DIR, project);
  mkdirSync(dir, { recursive: true });
  const base = `${opts.order}-${opts.screen}`;

  // Let fonts and images settle so the screenshot and the measurements match what a person sees.
  await page.evaluate(async () => {
    await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
  });
  await page.waitForTimeout(300);

  const shots = [`${project}/${base}.png`];
  await page.screenshot({ path: join(OUT_DIR, shots[0]!), fullPage: true });

  const m = await page.evaluate(measure, { minTap: MIN_TAP, tomato: TOMATO });

  if (m.scrollerOverflow > 40) {
    const scrolled = await page.evaluate(scrollInnerToBottom);
    if (scrolled) {
      await page.waitForTimeout(250);
      shots.push(`${project}/${base}-bottom.png`);
      await page.screenshot({ path: join(OUT_DIR, shots[1]!), fullPage: true });
      await page.evaluate(scrollInnerToTop);
    }
  }

  const url = new URL(page.url());
  const route = `${url.pathname}${url.search}`;
  const violations = opts.purpose === 'none' ? m.tomato.filter((t) => t.context === 'none') : [];
  const result: ScreenResult = {
    project,
    engine: testInfo.project.use.defaultBrowserType ?? testInfo.project.use.browserName ?? 'chromium',
    order: opts.order,
    screen: opts.screen,
    route,
    purpose: opts.purpose,
    viewport: `${m.innerWidth}x${m.innerHeight}`,
    screenshots: shots,
    checks: {
      noSidewaysScroll: m.scrollWidth <= m.innerWidth + 1,
      tapTargets: m.tap.length === 0,
      textFits: m.clipped.length === 0,
      tomatoRule: violations.length === 0,
    },
    sidewaysScroll: { scrollWidth: m.scrollWidth, innerWidth: m.innerWidth },
    tapTargetIssues: m.tap,
    tapTargetAllowed: m.tapAllowed,
    clippedText: m.clipped,
    truncatedText: m.truncated,
    offscreenControls: m.offscreen,
    tomato: m.tomato,
    tomatoViolations: violations,
    notes: opts.notes ?? [],
    reportOnly: opts.tapReportOnly ? { tapTargets: opts.tapReportOnly } : {},
  };
  writeFileSync(join(dir, `${base}.json`), `${JSON.stringify(result, null, 2)}\n`);
  await testInfo.attach(`${base}.png`, { path: join(OUT_DIR, shots[0]!), contentType: 'image/png' });

  const where = `${project} ${base} (${route})`;
  expect.soft(m.scrollWidth, `${where}: the page scrolls sideways (scrollWidth ${m.scrollWidth} > width ${m.innerWidth})`).toBeLessThanOrEqual(
    m.innerWidth + 1,
  );
  if (opts.tapReportOnly && m.tap.length > 0) {
    console.log(`${where}: tap targets under ${MIN_TAP}px reported, not failed (${opts.tapReportOnly}): ${m.tap.map((t) => `"${t.text}" ${t.width}x${t.height}`).join(', ')}`);
  } else expect
    .soft(m.tap, `${where}: tap targets under ${MIN_TAP}x${MIN_TAP} px:\n${m.tap.map((t) => `  - ${t.role} "${t.text}" ${t.width}x${t.height}`).join('\n')}`)
    .toEqual([]);
  expect
    .soft(m.clipped, `${where}: text cut off by its box:\n${m.clipped.map((c) => `  - ${c.kind} "${c.text}" content ${c.scroll} in box ${c.client}`).join('\n')}`)
    .toEqual([]);
  expect
    .soft(
      violations,
      `${where}: tomato outside a camera or money context:\n${violations.map((t) => `  - <${t.tag}> "${t.text}" (${t.props.join(', ')})`).join('\n')}`,
    )
    .toEqual([]);
  return result;
}
